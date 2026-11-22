/* D3 reuses the SQS/SNS terminal. Kinesis deployment here runs on the course clock. */
(() => {
  const options = {
    'create-stream': ['stream-name', 'stream-mode-details', 'shard-count'],
    'describe-stream-summary': ['stream-name'],
    'list-streams': [],
    wait: ['stream-name']
  };
  AG.messagingCLI = function ({service, op, toks, flag, sim, list, print, resultJson}) {
    if (!sim.account.pixMessaging || !['sns','sqs','kinesis'].includes(service)) return false;
    const region = sim.account.region;
    if (flag('region') !== null && flag('region') !== region) {
      print('err', 'PixShare ke resources ' + region + ' mein hain.');
      return true;
    }
    if (service !== 'kinesis') return false;
    const streams = list('kinesisStreams');
    try {
      if (!Object.hasOwn(options, op) || op === 'wait' && toks[3] !== 'stream-exists')
        throw Error('Is terminal mein create-stream, wait stream-exists, describe-stream-summary aur list-streams hain. Lab 35 mein records padho.');
      const allowed = [...options[op], 'region','query','output'], seen = new Set();
      for (let i = op === 'wait' ? 4 : 3; i < toks.length; i += 2) {
        const key = toks[i].slice(2);
        if (!toks[i].startsWith('--') || !allowed.includes(key) || seen.has(key)) throw Error('Unknown or repeated option: ' + toks[i]);
        if (!flag(key)) throw Error('aws: error: argument --' + key + ': expected one argument');
        seen.add(key);
      }
      if (op === 'list-streams') {
        resultJson({ StreamNames: streams.map(s => s.name), HasMoreStreams: false });
        return true;
      }
      const name = flag('stream-name');
      if (!name) throw Error('aws: error: the following arguments are required: --stream-name');
      const s = streams.find(s => s.name === name);
      if (op === 'create-stream') {
        let mode = flag('stream-mode-details');
        if (mode?.startsWith('{')) {
          const details = JSON.parse(mode);
          if (Object.keys(details).length !== 1) throw Error('ValidationException: invalid StreamModeDetails');
          mode = 'StreamMode=' + details.StreamMode;
        }
        if (mode !== 'StreamMode=ON_DEMAND') throw Error('PixShare terminal mein on-demand stream ke liye --stream-mode-details StreamMode=ON_DEMAND do.');
        if (seen.has('shard-count')) throw Error('ValidationException: ShardCount is not valid for ON_DEMAND');
        if (!/^[A-Za-z0-9_.-]{1,128}$/.test(name)) throw Error('ValidationException: invalid stream name');
        if (s) throw Error('ResourceInUseException: Stream already exists');
        streams.push({ name, mode: 'ON_DEMAND', status: 'CREATING', retentionHours: 24 });
        print('ok','');
      } else {
        if (!s) throw Error('ResourceNotFoundException: Stream not found');
        if (op === 'wait') { s.status = 'ACTIVE'; print('ok',''); }
        else resultJson({ StreamDescriptionSummary: { StreamName: name, StreamStatus: s.status,
          StreamARN: 'arn:aws:kinesis:' + region + ':' + sim.account.callerIdentity.Account + ':stream/' + name,
          StreamModeDetails: { StreamMode: s.mode }, RetentionPeriodHours: s.retentionHours } });
      }
    } catch (err) { print('err', err.message); }
    return true;
  };
})();
