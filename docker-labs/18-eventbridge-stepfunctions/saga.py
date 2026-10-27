"""Host reference saga using a TEST payment ledger and actual DynamoDB operations.

This is not a Step Functions ASL interpreter or an external payment gateway.
Each worker may resume a durable phase; inventory+READY use one transaction.
"""
from botocore.exceptions import ClientError

class IntentConflict(ValueError): pass
class Interrupted(RuntimeError): pass
class RefundUnavailable(RuntimeError): pass


def values(order):
    if not isinstance(order, dict) or set(order) != {'orderId','sku','amount','quantity'}:
        raise ValueError('Order requires exactly orderId, sku, amount and quantity')
    for key in ['orderId','sku']:
        value=order[key]
        if not isinstance(value,str) or not value or len(value)>100:
            raise ValueError(key+' must be a nonempty string up to100characters')
    for key in ['amount','quantity']:
        value=order[key]
        if type(value) is not int or not 1<=value<=1000000:
            raise ValueError(key+' must be positive integer1..1000000; booleans/strings are invalid')
    return {'orderId':{'S':order['orderId']},'sku':{'S':order['sku']},'amount':{'N':str(order['amount'])},'quantity':{'N':str(order['quantity'])}}


def read(client,table,order_id):
    return client.get_item(TableName=table,Key={'orderId':{'S':order_id}},ConsistentRead=True).get('Item')


def run(client,ledger,stock,order,*,interrupt=None,refund_unavailable=False):
    identity=values(order);key={'orderId':identity['orderId']}
    try:
        client.put_item(TableName=ledger,Item={**identity,'phase':{'S':'NEW'},'captureCount':{'N':'0'},'reserveCount':{'N':'0'},'refundCount':{'N':'0'}},ConditionExpression='attribute_not_exists(orderId)')
    except ClientError as error:
        if error.response['Error']['Code']!='ConditionalCheckFailedException':raise
    for _ in range(8):
        row=read(client,ledger,order['orderId'])
        if not row or any(row.get(k)!=v for k,v in identity.items()):
            raise IntentConflict('Existing order identity/payload differs; preserve ledger and investigate')
        phase=row.get('phase',{}).get('S')
        if phase in ['READY','REFUNDED']: return row
        if phase=='NEW':
            try:
                client.update_item(TableName=ledger,Key=key,UpdateExpression='SET #phase = :captured ADD captureCount :one',ConditionExpression='#phase = :new',ExpressionAttributeNames={'#phase':'phase'},ExpressionAttributeValues={':captured':{'S':'CAPTURED'},':new':{'S':'NEW'},':one':{'N':'1'}})
            except ClientError as error:
                if error.response['Error']['Code']=='ConditionalCheckFailedException':continue
                raise
            if interrupt=='after-capture':raise Interrupted('Host interrupted after durable TEST capture; resume same orderId')
            continue
        if phase!='CAPTURED':raise ValueError('Unknown durable phase '+str(phase)+'; do not acknowledge')
        try:
            client.transact_write_items(TransactItems=[
                {'Update':{'TableName':stock,'Key':{'sku':identity['sku']},'UpdateExpression':'SET #available = #available - :qty','ConditionExpression':'#available >= :qty','ExpressionAttributeNames':{'#available':'available'},'ExpressionAttributeValues':{':qty':identity['quantity']}}},
                {'Update':{'TableName':ledger,'Key':key,'UpdateExpression':'SET #phase = :ready ADD reserveCount :one','ConditionExpression':'#phase = :captured','ExpressionAttributeNames':{'#phase':'phase'},'ExpressionAttributeValues':{':ready':{'S':'READY'},':captured':{'S':'CAPTURED'},':one':{'N':'1'}}}}
            ])
            if interrupt=='after-reserve':raise Interrupted('Host interrupted after atomic stock+READY; retry must not reserve again')
        except ClientError as error:
            if error.response['Error']['Code']!='TransactionCanceledException':raise
            current=read(client,ledger,order['orderId'])
            if current and current.get('phase',{}).get('S') in ['READY','REFUNDED']:continue
            reasons=error.response.get('CancellationReasons',[])
            if not reasons or reasons[0].get('Code')!='ConditionalCheckFailed':raise
            if refund_unavailable:raise RefundUnavailable('TEST refund unavailable; keep CAPTURED intent for monitored retry/reconciliation')
            try:
                client.update_item(TableName=ledger,Key=key,UpdateExpression='SET #phase = :refunded ADD refundCount :one',ConditionExpression='#phase = :captured',ExpressionAttributeNames={'#phase':'phase'},ExpressionAttributeValues={':refunded':{'S':'REFUNDED'},':captured':{'S':'CAPTURED'},':one':{'N':'1'}})
            except ClientError as error:
                if error.response['Error']['Code']!='ConditionalCheckFailedException':raise
    raise RuntimeError('Host retry budget exhausted; preserve intent and inspect state')
