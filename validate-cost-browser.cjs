// Optional browser QA: PLAYWRIGHT_MODULE and CHROMIUM_PATH can point to an existing local install.
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url'),assert=require('assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const root=process.env.AWS_GURUKUL_EVIDENCE_DIR||path.join(__dirname,'.overhaul-evidence'),out=root+'/cost-screenshots';fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 const reports=[],errors=[];
 const overflow=async(page,label)=>{const d=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));if(d.scroll>d.width+1){console.log('OVERFLOW',label,d,await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({cls:e.className,text:e.textContent.slice(0,100),right:Math.round(e.getBoundingClientRect().right)})).slice(0,10)));await page.screenshot({path:out+'/failed-'+label.replace(/\W+/g,'-')+'.png',fullPage:true});}assert.ok(d.scroll<=d.width+1,'fits '+label);return d;};
 try{
 for(const width of [1280,360]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  await context.route(/^https?:/,r=>r.abort());page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(pathToFileURL(path.join(__dirname,'index.html')).href);
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}'});
  const types=await page.evaluate(()=>AG.findLevel('cost').stages.map(s=>s.type));assert.deepEqual(types,['dryrun','flowlab','bins','order','triage','terminal','docker','quiz'],'stage order');
  for(const stage of ['intro',0,1,2,3,4,5,6,7]){
   await page.evaluate(stage=>{const level=AG.findLevel('cost');if(stage==='intro')return showIntro(level);AG.session={level,stageIdx:stage,firstTry:0,total:0,replay:true};runStage();},stage);
   const dimensions=await overflow(page,width+'-stage-'+stage);reports.push({width,stage,dimensions});
   if(['intro',0,1,4,5,6].includes(stage)){const name={intro:'intro',0:'dryrun',1:'planner',4:'triage',5:'terminal',6:'lab'}[stage];await page.screenshot({path:`${out}/${name}-${width}.png`,fullPage:true});await page.screenshot({path:`${out}/${name}-${width}-viewport.png`});}
  }
  await page.evaluate(()=>showIntro(AG.findLevel('cost')));
  for(let card=0;card<8;card++){await page.locator('.st-pill').nth(card).click();const dimensions=await overflow(page,width+'-card-'+card);reports.push({width,lessonCard:card,dimensions});await page.locator('.steps-box').screenshot({path:`${out}/lesson-${card+1}-${width}.png`});}
  if(width===360){await page.locator('.st-pill').nth(1).click();const table=page.locator('.steps-box').getByRole('region',{name:'Cost comparison table'});await table.press('ArrowRight');await page.waitForTimeout(120);assert.ok(await table.evaluate(e=>e.scrollLeft>0),'phone table scrolls with keyboard');reports.push({width,keyboardTableSwipe:true});}
  // Dry run: diagram bounds, label collisions, answer the asks, finish.
  await page.evaluate(()=>{AG.session={level:AG.findLevel('cost'),stageIdx:0,firstTry:0,total:0,replay:true};runStage();});
  let steps=0;while(steps<10){const collisions=await page.evaluate(()=>{const hits=[],boxes=[...document.querySelectorAll('.ms-node > rect')].map(n=>n.getBBox());for(const box of boxes)if(box.x<0||box.y<0||box.x+box.width>1000||box.y+box.height>520)hits.push('node outside viewBox');for(const l of document.querySelectorAll('.ms-flabel rect')){const a=l.getBBox();if(boxes.some(b=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y))hits.push(l.parentNode.textContent);}return hits;});assert.deepEqual(collisions,[],'flow labels do not obscure nodes '+steps);
   const answer=await page.evaluate(i=>AG.findLevel('cost').stages[0].steps[i]?.ask?.answer??0,steps);const correct=page.locator('.dr-opt[data-i="'+answer+'"]:enabled');if(await correct.count())await correct.click();const next=page.locator('.dr-next:visible');if(!await next.count())break;await next.click();steps++;}
  await page.locator('.dr-done').click();assert.ok(await page.locator('.stage-summary').count(),'dryrun completes');reports.push({width,dryRunClicks:steps});
  // Planner: named keyboard sliders reach the documented container design.
  await page.evaluate(()=>{AG.session={level:AG.findLevel('cost'),stageIdx:1,firstTry:0,total:0,replay:true};runStage();});
  assert.equal(await page.locator('.fl-next').count(),0,'start state not solved');
  for(const [name,keyPresses,text] of [['Baseline ka coverage',2,null],['Commitment term',1,'3 years, assumed 45% off'],['Future demand drop',3,null]]){
   const slider=page.getByRole('slider',{name});await slider.press('Home');for(let i=0;i<keyPresses;i++)await slider.press('ArrowRight');if(text)assert.equal(await slider.getAttribute('aria-valuetext'),text,'keyboard slider '+name);}
  assert.ok(await page.locator('.fl-next').count(),'commitment design meets stress/saving/waste target');const readouts=await page.locator('.td-readouts').innerText();assert.ok(readouts.includes('26.3%')&&readouts.includes('0.0%'),'hourly commitment math '+readouts);
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:`${out}/planner-solved-${width}.png`,fullPage:true});
  // Both games must be solvable with keyboard activation.
  await page.evaluate(()=>{const level=AG.findLevel('cost'),arena=document.getElementById('app');arena.innerHTML='';window.binsDone=0;AG.renderers.bins(level.stages[2],arena,()=>window.binsDone++);});
  const items=await page.evaluate(()=>{const st=AG.findLevel('cost').stages[2];return st.items.map(i=>({text:i.text,label:st.bins.find(b=>b.id===i.bin).label}));});
  for(const item of items){await page.getByRole('button',{name:'Item: '+item.text,exact:true}).press('Enter');await page.getByRole('button',{name:'Category: '+item.label,exact:true}).press('Space');}
  await page.waitForFunction(()=>window.binsDone===1);reports.push({width,keyboardBins:true});
  await page.evaluate(()=>{const level=AG.findLevel('cost'),arena=document.getElementById('app');arena.innerHTML='';window.orderDone=0;AG.renderers.order(level.stages[3],arena,()=>window.orderDone++);});
  const order=await page.evaluate(()=>AG.findLevel('cost').stages[3].steps.map(s=>s.text));for(const text of order)await page.getByRole('button',{name:text,exact:true}).press('Enter');
  await page.waitForFunction(()=>window.orderDone===1);reports.push({width,keyboardOrder:true});
  // Terminal: keyboard entry; only the final current read wins.
  await page.evaluate(()=>{AG.session={level:AG.findLevel('cost'),stageIdx:5,firstTry:0,total:0,replay:true};runStage();});
  const input=page.locator('.term-in input'),commands=await page.evaluate(()=>AG.findLevel('cost').stages[5].solution);
  for(let i=0;i<commands.length;i++){await input.fill(commands[i]);await input.press('Enter');assert.equal(await page.locator('.stage-summary').count()>0,i===commands.length-1,'only final step wins '+i);}
  // The terminal adds its mission summary immediately; stageDone adds a second summary after 300ms.
  // Wait for the navigation summary and choose the mission summary by its heading, independent of timing.
  const missionSummary=page.locator('.stage-summary').filter({has:page.locator('.sum-title',{hasText:'Mission complete!'})});
  const completionSummary=page.locator('.stage-summary').filter({has:page.getByRole('button',{name:'Agla challenge →',exact:true})});
  await completionSummary.waitFor({state:'visible'});
  assert.equal(await missionSummary.count(),1,'one mission summary');assert.equal(await completionSummary.count(),1,'one stage navigation summary');
  await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));await missionSummary.evaluate(e=>e.getAnimations().forEach(a=>a.finish()));
  await page.screenshot({path:`${out}/terminal-solved-${width}.png`,fullPage:true});await overflow(page,width+'-terminal-solved');
  await page.locator('.terminal').screenshot({path:`${out}/terminal-output-${width}.png`});await missionSummary.screenshot({path:`${out}/terminal-summary-${width}.png`});
  await page.waitForTimeout(350);reports.push({width,plannerSolved:true,keyboardMission:true,keyboardNamedSlider:true});
  // Interview terminal renders and fits.
  await page.evaluate(()=>{const level=AG.findLevel('cost');const t=level.interview.questions.find(q=>q.terminal).terminal;const arena=document.getElementById('app');arena.innerHTML='';AG.renderers.terminal(t,arena,()=>{});});await overflow(page,width+'-interview-terminal');
  await page.evaluate(()=>{const arena=document.getElementById('app');arena.innerHTML='';window.containerInterviewDone=0;AG.renderers.terminal(AG.findLevel('cost').interview.questions.find(q=>q.terminal).terminal,arena,()=>window.containerInterviewDone++);});
  const iterm=page.locator('.term-in input'),icmd=await page.evaluate(()=>AG.findLevel('cost').interview.questions.find(q=>q.terminal).terminal.solution);
  for(let i=0;i<icmd.length;i++){await iterm.fill(icmd[i]);await iterm.press('Enter');if(i===icmd.length-1)await page.waitForFunction(()=>window.containerInterviewDone===1);assert.equal(await page.evaluate(()=>window.containerInterviewDone),i===icmd.length-1?1:0,'interview final step only '+i);}
  reports.push({width,interviewKeyboard:true,interviewFinalOnly:true});await overflow(page,width+'-interview-solved');await page.screenshot({path:`${out}/interview-solved-${width}.png`,fullPage:true});

  const treeIds=await page.evaluate(()=>AG.decisionsForLevel('cost').map(t=>t.id));assert.ok(['ec2buy'].every(id=>treeIds.includes(id)),'related decisions linked '+treeIds);
  for(const id of treeIds){await page.evaluate(id=>showDecisionTree(AG.findDecision(id)),id);reports.push({width,decision:id,dimensions:await overflow(page,width+'-decision-'+id)});}
  await page.evaluate(()=>showCertificate(AG.tracks.find(t=>t.id==='advanced')));assert.ok((await page.locator('.cert-sub').innerText()).length>0);await overflow(page,width+'-certificate');reports.push({width,certificate:true});
  await page.evaluate(()=>localStorage.setItem(AG.STORE_KEY,JSON.stringify({xp:42,completed:['cost'],stars:{cost:2}})));await page.reload();assert.ok(await page.evaluate(()=>AG.state.completed.includes('cost')&&AG.state.xp===42&&AG.state.streak&&AG.findLevel('cost').id==='cost'),'old progress schema and stable levelID survive reload');
  await page.evaluate(()=>localStorage.setItem(AG.STORE_KEY,'{broken'));await page.reload();assert.ok(await page.evaluate(()=>AG.state.completed.length===0&&AG.state.xp===0),'corrupt disposable progress recovers');reports.push({width,reload:true,oldSchema:true,corruptStorage:true});await context.close();
 }
 fs.writeFileSync(root+'/COST-BROWSER-REPORT.json',JSON.stringify({reports,errors},null,2));assert.equal(errors.length,0,'no console/page errors '+errors.join('\n'));console.log(JSON.stringify({samples:reports.length,errors,overflow:reports.filter(r=>r.dimensions&&r.dimensions.scroll>r.width+1)}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
