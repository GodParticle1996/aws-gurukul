"""Trusted SVG fixture only: versioned input and idempotent derivative writes."""
import hashlib
import json
import os
import xml.etree.ElementTree as ET
from urllib.parse import unquote_plus
import boto3
from botocore.exceptions import ClientError

SIZES = (64, 128, 256)


def process_s3(event, client):
    if not isinstance(event, dict):
        raise ValueError('S3 message body must be a JSON object')
    source, output = os.environ['SOURCE_BUCKET'], os.environ['OUTPUT_BUCKET']
    if source == output:
        raise ValueError('Lab requires separate source/output buckets; avoid recursive upload paths')
    records = event.get('Records')
    if not isinstance(records, list) or not records:
        raise ValueError('S3 event requires nonempty Records list')
    results = []
    for record in records:
        if not isinstance(record, dict) or record.get('eventSource') != 'aws:s3':
            raise ValueError('Expected aws:s3 event record')
        s3 = record.get('s3')
        if not isinstance(s3, dict) or not isinstance(s3.get('bucket'), dict) or not isinstance(s3.get('object'), dict):
            raise ValueError('S3 record requires bucket/object dictionaries')
        obj = s3['object']
        if not isinstance(obj.get('key'), str):
            raise ValueError('S3 object key must be URL-encoded string')
        key, version = unquote_plus(obj['key']), obj.get('versionId')
        if s3['bucket'].get('name') != source or not key.startswith('uploads/') or not key.endswith('.svg'):
            raise ValueError('Source bucket/uploads/*.svg contract mismatch; inspect event/filter')
        if not isinstance(version, str) or not version or version == 'null':
            raise ValueError('Versioned source event required; latest-key read could process a newer upload')
        body = client.get_object(Bucket=source, Key=key, VersionId=version)['Body'].read()
        if len(body) > 1024 * 1024:
            raise ValueError('Trusted SVG fixture limit is1MiB')
        root = ET.fromstring(body)
        if root.tag.rsplit('}', 1)[-1] != 'svg' or not root.get('viewBox'):
            raise ValueError('SVG root with viewBox required; this is not a JPEG/PNG decoder')
        identity = hashlib.sha256((source + '\0' + key + '\0' + version).encode()).hexdigest()[:24]
        written = duplicates = 0
        for size in SIZES:
            root.set('width', str(size)); root.set('height', str(size))
            root.set('preserveAspectRatio', 'xMidYMid meet')
            derivative = ET.tostring(root, encoding='utf-8', xml_declaration=True)
            target = f'thumbs/{identity}/{size}.svg'
            try:
                client.put_object(Bucket=output, Key=target, Body=derivative, ContentType='image/svg+xml', IfNoneMatch='*')
                written += 1
            except ClientError as error:
                if error.response['Error']['Code'] not in ('PreconditionFailed', '412'):
                    raise
                if client.get_object(Bucket=output, Key=target)['Body'].read() != derivative:
                    raise ValueError('Existing derivative differs; do not acknowledge corrupt idempotency collision') from error
                duplicates += 1
        results.append({'sourceVersion': version, 'prefix': f'thumbs/{identity}/', 'written': written, 'duplicates': duplicates})
    return results


def handler(event, context):
    if not isinstance(event, dict):
        raise ValueError('Handler event must be a JSON object')
    endpoint = os.environ.get('AWS_ENDPOINT_URL')
    client = boto3.client('s3', **({'endpoint_url': endpoint} if endpoint else {}))
    records = event.get('Records')
    if isinstance(records, list) and records and isinstance(records[0], dict) and records[0].get('eventSource') == 'aws:sqs':
        failures = []
        for record in records:
            if not isinstance(record, dict) or not isinstance(record.get('messageId'), str) or not record['messageId']:
                raise ValueError('SQS record missing messageId; cannot report safe partial acknowledgement')
            try:
                if record.get('eventSource') != 'aws:sqs':
                    raise ValueError('Expected standard SQS record in batch')
                process_s3(json.loads(record.get('body', '')), client)
            except (ValueError, KeyError, TypeError, ET.ParseError, ClientError):
                failures.append({'itemIdentifier': record['messageId']})
        return {'batchItemFailures': failures}
    return {'results': process_s3(event, client)}
