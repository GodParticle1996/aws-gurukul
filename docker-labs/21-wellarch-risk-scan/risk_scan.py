"""Teen declared configuration contracts; not an AWS WA Tool assessment or runtime audit."""
import json
from botocore.exceptions import ClientError

def trail_policy(bucket,trail_arn):
 return {'Version':'2012-10-17','Statement':[{'Sid':'ACL','Effect':'Allow','Principal':{'Service':'cloudtrail.amazonaws.com'},'Action':'s3:GetBucketAcl','Resource':f'arn:aws:s3:::{bucket}','Condition':{'StringEquals':{'aws:SourceArn':trail_arn}}},{'Sid':'Write','Effect':'Allow','Principal':{'Service':'cloudtrail.amazonaws.com'},'Action':'s3:PutObject','Resource':f'arn:aws:s3:::{bucket}/AWSLogs/123456789012/*','Condition':{'StringEquals':{'s3:x-amz-acl':'bucket-owner-full-control','aws:SourceArn':trail_arn}}}]}

def scan(clients,name,topic):
 rds,cw,ct,s3=(clients[s] for s in ['rds','cloudwatch','cloudtrail','s3'])
 db=rds.describe_db_instances(DBInstanceIdentifier=name)['DBInstances'][0]
 alarms=cw.describe_alarms(AlarmNames=[name])['MetricAlarms']
 trails=ct.describe_trails(trailNameList=[name])['trailList'];trail=trails[0] if trails else None
 status=ct.get_trail_status(Name=name) if trail else {}
 selectors=ct.get_event_selectors(TrailName=name).get('EventSelectors',[]) if trail else []
 try:policy=json.loads(s3.get_bucket_policy(Bucket=name)['Policy'])
 except ClientError as e:
  if e.response['Error']['Code']!='NoSuchBucketPolicy':raise
  policy=None
 findings=[]
 if not db['MultiAZ'] or db['BackupRetentionPeriod']<7:findings.append({'pillar':'Reliability','risk':'HA+7day backup configuration absent','severity':'course-high'})
 expected={'Namespace':'AWS/ApplicationELB','MetricName':'HTTPCode_Target_5XX_Count','Statistic':'Sum','Unit':'Count','Threshold':5.,'ComparisonOperator':'GreaterThanThreshold','Period':60,'EvaluationPeriods':2,'DatapointsToAlarm':2,'TreatMissingData':'missing','AlarmActions':[topic],'ActionsEnabled':True,'Dimensions':[{'Name':'LoadBalancer','Value':'app/TRAINING-NOT-DEPLOYED/0000000000000021'}]}
 if not alarms or any(alarms[0].get(k)!=v for k,v in expected.items()):findings.append({'pillar':'Operational Excellence','risk':'reviewed5xxalarm configuration absent','severity':'course-high'})
 management=any(s.get('IncludeManagementEvents') and s.get('ReadWriteType')=='All' for s in selectors)
 if not trail or not trail['IsMultiRegionTrail'] or not trail.get('IncludeGlobalServiceEvents') or not trail.get('LogFileValidationEnabled') or not status.get('IsLogging') or not management or policy!=trail_policy(name,trail['TrailARN']):findings.append({'pillar':'Security','risk':'scoped multiRegion management logging+validation configuration absent','severity':'course-high'})
 return {'declaredConfigRisks':findings,'count':len(findings),'notAnAWSWAReview':True,'runtimeUnverified':['SQL restore/failover','real5xxmeasurement/alarmdelivery','CloudTrailS3delivery/digest','otherpillarcontrols']}
