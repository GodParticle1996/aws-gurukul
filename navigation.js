/* A bookmark opens a screen. A level bookmark always opens its lesson. */
AG.levelOpen = function (level, state = AG.state) {
  const track = AG.trackOf(level);
  if (!track || !AG.trackUnlocked(track, state)) return false;
  const levels = AG.levelsOf(track);
  const i = levels.indexOf(level);
  return i === 0 || state.completed.includes(level.id) || state.completed.includes(levels[i - 1].id);
};

AG.nextLevel = function () {
  for (const track of AG.tracks) {
    const level = AG.levelsOf(track).find(l => AG.levelOpen(l) && !AG.state.completed.includes(l.id));
    if (level) return level;
  }
  return null;
};

AG.nav = (() => {
  let restoring = false;
  function set(path = '') {
    if (!window.location || !window.history) return;
    const hash = path ? '#' + path : '';
    if (location.hash === hash) return;
    history[restoring ? 'replaceState' : 'pushState'](null, '', location.pathname + location.search + hash);
  }
  function open() {
    const path = window.location ? location.hash.slice(1) : '';
    const [screen, id, ...rest] = path.split('/');
    restoring = true;
    AG.session = null;
    try {
      if (rest.length) return showHome();
      const track = AG.tracks.find(t => t.id === id);
      switch (screen) {
        case 'track':
          if (track && AG.trackUnlocked(track)) return showTrack(track);
          break;
        case 'level': {
          const level = AG.findLevel(id);
          if (!level) break;
          if (AG.levelOpen(level)) return showIntro(level);
          const parent = AG.trackOf(level);
          if (AG.trackUnlocked(parent)) return showTrack(parent);
          break;
        }
        case 'certificate':
          if (track && AG.trackUnlocked(track) && AG.trackProgress(track).complete) return showCertificate(track);
          break;
        case 'search': if (!id) return AG.search.show(); break;
        case 'labs': if (!id) return AG.labHub.show(); break;
        case 'mock': if (!id) return AG.mock.show(); break;
        case 'study': if (AG.findLevel(id)) return showIntro(AG.findLevel(id), true); break;
        case 'dojo': if (!id) return showDojo(); break;
        case 'decisions': if (!id) return showDecisionDojo(); break;
        case 'decision': if (AG.findDecision(id)) return showDecisionTree(AG.findDecision(id)); break;
        case 'practice':
          if (!id || AG.findDecision(id)) return showDecisionPractice(AG.findDecision(id));
          break;
        case 'soch': return AG.showSoch(AG.sochCases.find(c => c.id === id));
      }
      showHome();
    } finally {
      restoring = false;
    }
  }
  function start() {
    if (window.addEventListener) window.addEventListener('hashchange', open);
    open();
  }
  return { set, start };
})();
