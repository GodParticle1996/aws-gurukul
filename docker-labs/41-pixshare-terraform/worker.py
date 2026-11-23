"""The lab calls the same SQS handler it packages for Lambda."""
import json
import os
import boto3
from botocore.exceptions import ClientError


def safe(event, context):
    db = boto3.client("dynamodb")
    table = os.environ["TABLE_NAME"]
    results = []
    for record in event["Records"]:
        job = json.loads(record["body"])
        # The publisher keeps one operation ID across retries. A separate edit gets a new ID.
        tenant, operation, photo = (job[k] for k in ("tenant", "operationId", "photo"))
        if not all(isinstance(x, str) and x and "#" not in x for x in (tenant, operation, photo)):
            raise ValueError("Invalid thumbnail identity")
        key = {"pk": {"S": f"EVENT#{tenant}#{operation}"}}
        marker = {**key, "photo": {"S": photo}}
        try:
            db.transact_write_items(TransactItems=[
                {"Put": {"TableName": table, "Item": marker, "ConditionExpression": "attribute_not_exists(pk)"}},
                {"Update": {"TableName": table, "Key": {"pk": {"S": "TOTAL#" + tenant}},
                            "UpdateExpression": "ADD #u :one", "ExpressionAttributeNames": {"#u": "units"},
                            "ExpressionAttributeValues": {":one": {"N": "1"}}}},
            ])
        except ClientError as error:
            reasons = [x.get("Code") for x in error.response.get("CancellationReasons", [])]
            if error.response["Error"]["Code"] != "TransactionCanceledException" or reasons != ["ConditionalCheckFailed", "None"]:
                raise
            saved = db.get_item(TableName=table, Key=key, ConsistentRead=True).get("Item")
            if saved != marker:
                raise ValueError("Operation ID reused for another photo") from error
            results.append("duplicate")
        else:
            results.append("counted")
    return results
