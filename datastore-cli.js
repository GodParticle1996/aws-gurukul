/* PixShare's offline terminal. Existing DynamoDB commands own the table and index state. */
(() => {
  const operations = {
    'dynamodb export-table-to-point-in-time': ['table-arn', 's3-bucket', 's3-prefix', 'export-format', 'client-token'],
    'dynamodb describe-export': ['export-arn'],
    'dynamodb list-exports': ['table-arn'],
    'rds create-db-cluster': ['db-cluster-identifier', 'engine', 'master-username', 'manage-master-user-password', 'storage-encrypted', 'no-storage-encrypted'],
    'rds delete-db-cluster': ['db-cluster-identifier', 'skip-final-snapshot'],
    'rds describe-db-clusters': ['db-cluster-identifier'],
    'rds wait': ['db-cluster-identifier']
  };
  const switches = ['manage-master-user-password', 'storage-encrypted', 'no-storage-encrypted', 'skip-final-snapshot'];
  AG.datastoreCLI = function ({service, op, toks, flag, sim, list, print, resultJson, putObject}) {
    const state = sim.account.pixData;
    if (!state || !['rds', 'dynamodb'].includes(service)) return false;
    const region = sim.account.region, account = sim.account.callerIdentity.Account;
    if (flag('region') !== null && flag('region') !== region) {
      print('err', 'PixShare ke resources ' + region + ' mein hain.');
      return true;
    }
    const options = operations[service + ' ' + op];
    if (!options) return false;
    function need(name) {
      const value = flag(name);
      if (!value) throw Error('aws: error: the following arguments are required: --' + name);
      return value;
    }
    const tableArn = name => 'arn:aws:dynamodb:' + region + ':' + account + ':table/' + name;
    try {
      const waiter = service === 'rds' && op === 'wait';
      if (waiter && toks[3] !== 'db-cluster-available') return false;
      const seen = new Set();
      for (let i = waiter ? 4 : 3; i < toks.length; i++) {
        const token = toks[i], name = token.slice(2);
        if (!token.startsWith('--') || ![...options,'region','query','output'].includes(name) || seen.has(name))
          throw Error('Unknown or repeated option: ' + token);
        seen.add(name);
        if (!switches.includes(name)) { need(name); i++; }
      }
      if (service === 'rds') {
        const id = flag('db-cluster-identifier');
        const cluster = state.clusters.find(c => c.DBClusterIdentifier === id);
        if (op === 'create-db-cluster') {
          need('db-cluster-identifier');
          if (!/^[a-z][a-z0-9-]{0,62}$/.test(id) || id.endsWith('-') || id.includes('--'))
            throw Error('InvalidParameterValue: invalid DB cluster identifier');
          const engine = need('engine'), username = need('master-username');
          if (engine !== 'aurora-postgresql' || !seen.has('manage-master-user-password'))
            throw Error('PixShare fixture: use aurora-postgresql and --manage-master-user-password.');
          if (!/^[A-Za-z][A-Za-z0-9]{0,15}$/.test(username)) throw Error('InvalidParameterValue: invalid master username');
          if (cluster) throw Error('DBClusterAlreadyExistsFault: DB cluster already exists');
          const c = { DBClusterIdentifier: id, Engine: engine, MasterUsername: username, Status: 'creating',
            StorageEncrypted: seen.has('storage-encrypted'),
            StorageEncryptionType: seen.has('storage-encrypted') ? 'sse-kms' : 'sse-rds', DBClusterMembers: [] };
          state.clusters.push(c);
          resultJson({ DBCluster: c });
        } else {
          if (op === 'delete-db-cluster') {
            need('db-cluster-identifier');
            if (!cluster) throw Error('DBClusterNotFoundFault: DB cluster not found');
            if (!seen.has('skip-final-snapshot')) throw Error('InvalidParameterCombination: supply a final snapshot identifier or --skip-final-snapshot');
            state.clusters.splice(state.clusters.indexOf(cluster), 1);
            resultJson({ DBCluster: { ...cluster, Status: 'deleting' } });
            return true;
          }
          if (waiter) need('db-cluster-identifier');
          if (id && !cluster) throw Error('DBClusterNotFoundFault: DB cluster not found');
          if (waiter) { cluster.Status = 'available'; print('ok', ''); }
          else resultJson({ DBClusters: id ? [cluster] : state.clusters });
        }
        return true;
      }
      if (op === 'list-exports') {
        const arn = flag('table-arn');
        resultJson({ ExportSummaries: state.exports.filter(e => !arn || e.view.TableArn === arn).map(e => ({
          ExportArn: e.view.ExportArn, ExportStatus: e.view.ExportStatus, ExportType: 'FULL_EXPORT' })) });
        return true;
      }
      if (op === 'describe-export') {
        const arn = need('export-arn'), e = state.exports.find(job => job.view.ExportArn === arn);
        if (!e) throw Error('ExportNotFoundException: export not found');
        if (e.view.ExportStatus === 'IN_PROGRESS') {
          const b = list('buckets').find(b => b.name === e.view.S3Bucket);
          if (!b) { e.view.ExportStatus = 'FAILED'; e.view.FailureCode = 'S3NoSuchBucket'; }
          else {
            const path = [e.view.S3Prefix,'AWSDynamoDB',e.id,'manifest-summary.json'].filter(Boolean).join('/');
            const body = JSON.stringify({ exportArn: arn, tableArn: e.view.TableArn, itemCount: e.rows.length,
              outputFormat: e.view.ExportFormat });
            putObject(b, path, body.length, body);
            Object.assign(e.view, { ExportStatus: 'COMPLETED', ItemCount: e.rows.length, ExportManifest: path });
          }
          e.completedAt = Date.now();
        }
        resultJson({ ExportDescription: e.view });
        return true;
      }
      const arn = need('table-arn'), bucket = need('s3-bucket'), prefix = flag('s3-prefix') || '';
      const format = flag('export-format') || 'DYNAMODB_JSON', token = flag('client-token');
      if (!['DYNAMODB_JSON','ION'].includes(format)) throw Error('ValidationException: invalid ExportFormat');
      if (token && token.includes('$')) throw Error('ValidationException: invalid client token');
      if (bucket.length > 255 || !/^[A-Za-z0-9][.\w-]*[A-Za-z0-9]$/.test(bucket) || prefix.length > 1024)
        throw Error('ValidationException: invalid S3 destination');
      const signature = JSON.stringify([arn,bucket,prefix,format]);
      const old = token && state.exports.find(e => e.token === token &&
        (e.completedAt === undefined || Date.now() - e.completedAt < 8 * 3600000));
      if (old) {
        if (old.signature !== signature) throw Error('ExportConflictException: client token used for different export parameters');
        resultJson({ ExportDescription: old.view });
        return true;
      }
      const table = list('tables').find(t => tableArn(t.name) === arn);
      if (!table) throw Error('TableNotFoundException: table not found');
      if (!table.pitr?.enabled) throw Error('PointInTimeRecoveryUnavailableException: enable point-in-time recovery');
      const id = '01690000000000-' + String(state.exports.length + 1).padStart(8, '0');
      const view = { ExportArn: arn + '/export/' + id, TableArn: arn, TableId: table.tableId, S3Bucket: bucket,
        S3Prefix: prefix, ExportFormat: format, ExportType: 'FULL_EXPORT', ExportStatus: 'IN_PROGRESS' };
      // Freeze the rows at request time. A later feed write belongs to a newer snapshot.
      state.exports.push({ id, token, signature, view, rows: JSON.parse(JSON.stringify(table.items || [])) });
      resultJson({ ExportDescription: view });
    } catch (err) { print('err', err.message); }
    return true;
  };
})();
