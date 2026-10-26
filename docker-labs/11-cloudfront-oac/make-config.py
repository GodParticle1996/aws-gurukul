"""Prepare inspectable lab JSON. No cloud calls, credentials or real endpoints."""
import json,os,pathlib
out=pathlib.Path('.lab')
def write(n,v): (out/n).write_text(json.dumps(v,indent=2)+'\n')
cfg=dict(CallerReference=os.environ['CALLER'],Comment='ShopKaro lab11 metadata only',Origins=dict(Quantity=1,Items=[dict(Id='s3-shop',DomainName=os.environ['BUCKET']+'.s3.ap-south-1.amazonaws.com',S3OriginConfig=dict(OriginAccessIdentity=''))]),DefaultCacheBehavior=dict(TargetOriginId='s3-shop',ViewerProtocolPolicy='redirect-to-https',TrustedSigners=dict(Enabled=False,Quantity=0),TrustedKeyGroups=dict(Enabled=False,Quantity=0),CachePolicyId='658327ea-f89d-4fab-a63d-7e88639e58f6',Compress=True),Enabled=True,PriceClass='PriceClass_All',ViewerCertificate=dict(CloudFrontDefaultCertificate=True),HttpVersion='http2',IsIPV6Enabled=True)
write('distribution.json',cfg)
write('oac.json',dict(Name=os.environ['BUCKET'],Description='Local metadata OAC',SigningProtocol='sigv4',SigningBehavior='always',OriginAccessControlOriginType='s3'))
if os.environ.get('OAC'):
 cfg['Origins']['Items'][0]['OriginAccessControlId']=os.environ['OAC'];write('attach-oac.json',cfg)
 write('policy.json',dict(Version='2012-10-17',Statement=[dict(Effect='Allow',Principal=dict(Service='cloudfront.amazonaws.com'),Action='s3:GetObject',Resource='arn:aws:s3:::'+os.environ['BUCKET']+'/*',Condition={'StringEquals':{'AWS:SourceArn':os.environ['DIST_ARN']}})]))
