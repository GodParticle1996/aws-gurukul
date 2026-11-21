/* Regional settings for the checkout drill. Route 53 uses the shared DNS simulator. */
(() => {
  const primary = 'ap-south-1', standby = 'ap-south-2';
  const keyId = 'mrk-32aa0000000000000000000000000032';
  const account = '555555555555', secret = 'shopkaro/checkout', group = 'checkout-dr';
  const keyArn = r => 'arn:aws:kms:' + r + ':' + account + ':key/' + keyId;
  const secretArn = r => 'arn:aws:secretsmanager:' + r + ':' + account + ':secret:' + secret + '-TEST32';
  AG.regionDrill = { primary, standby, keyId, keyArn, secret, group };
  const operations = {
    'kms replicate-key': ['key-id', 'replica-region'],
    'kms describe-key': ['key-id'],
    'secretsmanager replicate-secret-to-regions': ['secret-id', 'add-replica-regions'],
    'secretsmanager remove-regions-from-replication': ['secret-id', 'remove-replica-regions'],
    'secretsmanager describe-secret': ['secret-id'],
    'autoscaling update-auto-scaling-group': ['auto-scaling-group-name', 'min-size', 'desired-capacity'],
    'autoscaling describe-auto-scaling-groups': ['auto-scaling-group-names'],
    'cloudwatch put-metric-alarm': ['cli-input-json'],
    'cloudwatch describe-alarms': ['alarm-names']
  };
  AG.finalbossCLI = ({ service, op, toks, sim, flag, print, resultJson }) => {
    if (!['kms', 'secretsmanager', 'autoscaling', 'cloudwatch'].includes(service)) return false;
    const drill = sim.account.regionDrill;
    const region = flag('region') || primary;
    const required = name => {
      const value = flag(name);
      if (!value) throw Error('aws: error: the following arguments are required: --' + name);
      return value;
    };
    const key = r => ({ KeyId: keyId, Arn: keyArn(r), MultiRegion: true, KeyState: 'Enabled',
      MultiRegionConfiguration: { MultiRegionKeyType: r === primary ? 'PRIMARY' : 'REPLICA',
        PrimaryKey: { Region: primary, Arn: keyArn(primary) }, ReplicaKeys: drill.replica ? [{ Region: standby, Arn: keyArn(standby) }] : [] } });
    const secretView = () => ({ Name: secret, ARN: secretArn(region),
      ...(region === primary ? { ReplicationStatus: drill.secretKey ? [{ Region: standby, Status: 'InSync', KmsKeyId: drill.secretKey }] : [] } : { PrimaryRegion: primary, KmsKeyId: drill.secretKey }) });
    try {
      const options = operations[service + ' ' + op];
      if (!options) throw Error('Drill mein is service ka yeh command nahi hai. help dekho.');
      const allowed = [...options, 'region', 'output', 'query'];
      const seen = new Set();
      for (let i = 3; i < toks.length; i += 2) {
        const name = toks[i].slice(2);
        if (!toks[i].startsWith('--') || !allowed.includes(name) || seen.has(name)) throw Error('Unknown or repeated option: ' + toks[i]);
        required(name);
        seen.add(name);
      }
      if (![primary, standby].includes(region)) throw Error('Drill mein Mumbai aur Hyderabad Regions hain.');
      let response;
      if (service === 'kms') {
        const id = required('key-id');
        if (id === '12345678-1234-4000-8000-000000000032' && region === primary && op === 'replicate-key') throw Error('UnsupportedOperationException: single-Region key');
        if (![keyId, keyArn(region)].includes(id) || (region === standby && !drill.replica)) throw Error('NotFoundException: Key not found');
        if (op === 'replicate-key') {
          if (region !== primary || required('replica-region') !== standby) throw Error('ValidationException: choose the other Region from the primary key');
          if (drill.replica) throw Error('AlreadyExistsException: Replica key already exists');
          drill.replica = true;
          response = { ReplicaKeyMetadata: key(standby) };
        } else response = { KeyMetadata: key(region) };
      }
      if (service === 'secretsmanager') {
        if (![secret, secretArn(region)].includes(required('secret-id')) || (region === standby && !drill.secretKey)) throw Error('ResourceNotFoundException: Secret not found');
        if (op === 'replicate-secret-to-regions') {
          if (region !== primary) throw Error('InvalidRequestException: use the primary secret');
          const raw = required('add-replica-regions');
          const params = Object.fromEntries(raw.split(',').map(pair => pair.split('=')));
          if (raw.split(',').length !== Object.keys(params).length || raw.split(',').some(p => !/^[^=]+=[^=]+$/.test(p)) || params.Region !== standby || Object.keys(params).some(k => !['Region', 'KmsKeyId'].includes(k))) throw Error('InvalidParameterException: invalid replica Region or option');
          if (params.KmsKeyId && !(drill.replica && [keyArn(standby), keyId].includes(params.KmsKeyId))) throw Error('InvalidRequestException: replica KMS key unavailable');
          if (drill.secretKey) throw Error('InvalidRequestException: Region already configured');
          drill.secretKey = params.KmsKeyId ? keyArn(standby) : 'alias/aws/secretsmanager';
        }
        if (op === 'remove-regions-from-replication') {
          if (region !== primary || required('remove-replica-regions') !== standby || !drill.secretKey) throw Error('InvalidParameterException: no matching replica');
          drill.secretKey = '';
        }
        const view = secretView();
        response = op === 'describe-secret' ? view : { ARN: view.ARN, ReplicationStatus: view.ReplicationStatus };
      }
      if (service === 'autoscaling') {
        if (op === 'update-auto-scaling-group') {
          if (region !== standby || required('auto-scaling-group-name') !== group) throw Error('ValidationError: Auto Scaling group not found');
          if (!flag('min-size') && !flag('desired-capacity')) throw Error('ValidationError: supply a capacity');
          const min = Number(flag('min-size') ?? drill.min);
          const desired = Number(flag('desired-capacity') ?? Math.max(min, drill.desired));
          if (![min, desired].every(Number.isInteger) || min < 0 || desired < min || desired > 6) throw Error('ValidationError: min <= desired <= max (6)');
          drill.min = min;
          drill.desired = desired;
        } else {
          const found = region === standby && (!flag('auto-scaling-group-names') || flag('auto-scaling-group-names') === group);
          response = { AutoScalingGroups: found ? [{ AutoScalingGroupName: group, MinSize: drill.min, DesiredCapacity: drill.desired, MaxSize: 6 }] : [] };
        }
      }
      if (service === 'cloudwatch') {
        if (op === 'put-metric-alarm') {
          const input = required('cli-input-json');
          const raw = input.startsWith('file://') ? sim.files[input.slice(7)]?.content : input;
          if (!raw) throw Error('Unable to load paramfile: ' + input);
          const alarm = JSON.parse(raw);
          const fields = ['AlarmName', 'MetricName', 'Namespace', 'Statistic', 'Period', 'EvaluationPeriods', 'Threshold', 'ComparisonOperator'];
          if (!alarm || fields.some(k => alarm[k] === undefined) || Object.keys(alarm).some(k => !fields.includes(k))) throw Error('ValidationError: incomplete or unsupported alarm');
          if (![alarm.AlarmName, alarm.MetricName, alarm.Namespace].every(x => typeof x === 'string' && x.length) ||
              !['Sum','Maximum','Minimum','Average','SampleCount'].includes(alarm.Statistic) || !Number.isFinite(alarm.Threshold) ||
              !['GreaterThanOrEqualToThreshold','LessThanThreshold','GreaterThanThreshold','LessThanOrEqualToThreshold'].includes(alarm.ComparisonOperator) ||
              !Number.isInteger(alarm.EvaluationPeriods) || alarm.EvaluationPeriods < 1 || !Number.isInteger(alarm.Period) ||
              alarm.Period < 60 || alarm.Period % 60 !== 0) throw Error('ValidationError: check alarm fields (drill uses standard resolution)');
          drill.alarms = drill.alarms.filter(a => a.region !== region || a.config.AlarmName !== alarm.AlarmName);
          drill.alarms.push({ region, config: alarm });
        } else response = { MetricAlarms: drill.alarms.filter(a => a.region === region && (!flag('alarm-names') || a.config.AlarmName === flag('alarm-names'))).map(a => a.config) };
      }
      if (response === undefined) print('ok', '');
      else resultJson(response);
    } catch (error) { print('err', error.message); }
    return true;
  };
})();
