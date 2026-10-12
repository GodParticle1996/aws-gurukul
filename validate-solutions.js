/* Overrides — un missions ke liye jinke hints mein jaan-boojh ke <placeholder>
   hain (learner ko khud ARN bharna hai), isliye auto-extractor unhe nahi chala sakta. */
module.exports = {
  'sqssns#2': [
    'aws sqs create-queue --queue-name email-queue',
    'aws sqs create-queue --queue-name analytics-queue',
    'aws sns create-topic --name order-events',
    'aws sns subscribe --topic-arn arn:aws:sns:us-east-1:123456789012:order-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:email-queue',
    'aws sns subscribe --topic-arn arn:aws:sns:us-east-1:123456789012:order-events --protocol sqs --notification-endpoint arn:aws:sqs:us-east-1:123456789012:analytics-queue',
    'aws sns publish --topic-arn arn:aws:sns:us-east-1:123456789012:order-events --message Order123',
    'aws sqs receive-message --queue-name email-queue',
    'aws sqs receive-message --queue-name analytics-queue',
  ],
};
