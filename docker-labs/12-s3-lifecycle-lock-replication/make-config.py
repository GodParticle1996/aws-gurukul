"""Write inspectable metadata requests for lab-owned buckets only."""
import os,json,pathlib
p=pathlib.Path('.lab')
def write(n,v):(p/n).write_text(json.dumps(v,indent=2)+'\n')
src,dr,role=(os.environ[k] for k in ['SRC','DR','ROLE'])
write('trust.json',dict(Version='2012-10-17',Statement=[dict(Effect='Allow',Principal={'Service':'s3.amazonaws.com'},Action='sts:AssumeRole')]))
write('role-policy.json',dict(Version='2012-10-17',Statement=[dict(Effect='Allow',Action=['s3:GetReplicationConfiguration','s3:ListBucket'],Resource='arn:aws:s3:::'+src),dict(Effect='Allow',Action=['s3:GetObjectVersionForReplication','s3:GetObjectVersionAcl','s3:GetObjectVersionTagging','s3:GetObjectRetention','s3:GetObjectLegalHold'],Resource='arn:aws:s3:::'+src+'/invoices/*'),dict(Effect='Allow',Action=['s3:ReplicateObject','s3:ReplicateDelete','s3:ReplicateTags'],Resource='arn:aws:s3:::'+dr+'/invoices/*')]))
write('replication.json',dict(Role=role,Rules=[dict(ID='invoices-crr',Priority=1,Status='Enabled',Filter=dict(Prefix='invoices/'),DeleteMarkerReplication=dict(Status='Disabled'),Destination=dict(Bucket='arn:aws:s3:::'+dr))]))
write('tiering.json',dict(Id='unknown-media',Status='Enabled',Filter=dict(Prefix='media/'),Tierings=[dict(Days=180,AccessTier='ARCHIVE_ACCESS'),dict(Days=365,AccessTier='DEEP_ARCHIVE_ACCESS')]))
write('lock.json',dict(ObjectLockEnabled='Enabled',Rule=dict(DefaultRetention=dict(Mode='GOVERNANCE',Days=1))))
