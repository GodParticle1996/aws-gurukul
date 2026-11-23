terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "= 6.70.0" }
  }
}

variable "endpoint" {
  type = string
  validation {
    condition     = can(regex("^http://127[.]0[.]0[.]1:[1-9][0-9]*$", var.endpoint))
    error_message = "Supply the private Moto listener opened by lab.py."
  }
}
provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
  endpoints {
    cloudfront = var.endpoint
    dynamodb   = var.endpoint
    events     = var.endpoint
    iam        = var.endpoint
    lambda     = var.endpoint
    s3         = var.endpoint
    sns        = var.endpoint
    sqs        = var.endpoint
    sts        = var.endpoint
    logs       = var.endpoint
  }
}

resource "aws_s3_bucket" "media" {
  bucket = "pixshare-41-media"
}
resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "pix-media"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
resource "aws_cloudfront_distribution" "media" {
  enabled             = true
  wait_for_deployment = false
  origin {
    origin_id                = "photos"
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }
  default_cache_behavior {
    target_origin_id       = "photos"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}
resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect   = "Allow", Principal = { Service = "cloudfront.amazonaws.com" }, Action = "s3:GetObject",
    Resource = "${aws_s3_bucket.media.arn}/images/*", Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.media.arn } }
  }] })
}

resource "aws_dynamodb_table" "usage" {
  name         = "pix-usage"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  attribute {
    name = "pk"
    type = "S"
  }
}
resource "aws_sns_topic" "uploads" { name = "pix-uploads" }
resource "aws_sqs_queue" "failed" {
  name                      = "pix-failed"
  message_retention_seconds = 1209600
}
resource "aws_sqs_queue" "jobs" {
  name                       = "pix-jobs"
  visibility_timeout_seconds = 60
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.failed.arn, maxReceiveCount = 5 })
}
resource "aws_sqs_queue_policy" "jobs" {
  queue_url = aws_sqs_queue.jobs.url
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect   = "Allow", Principal = { Service = "sns.amazonaws.com" }, Action = "sqs:SendMessage",
    Resource = aws_sqs_queue.jobs.arn, Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.uploads.arn } }
  }] })
}
resource "aws_sns_topic_subscription" "thumb" {
  topic_arn            = aws_sns_topic.uploads.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.jobs.arn
  raw_message_delivery = true
  depends_on           = [aws_sqs_queue_policy.jobs]
}
resource "aws_cloudwatch_event_rule" "review" {
  name          = "pix-review"
  event_pattern = jsonencode({ source = ["pix.upload"], "detail-type" = ["PhotoAccepted"], detail = { review = [true] } })
}
resource "aws_sqs_queue" "review" { name = "pix-review" }
resource "aws_sqs_queue_policy" "review" {
  queue_url = aws_sqs_queue.review.url
  policy = jsonencode({ Version = "2012-10-17", Statement = [{
    Effect   = "Allow", Principal = { Service = "events.amazonaws.com" }, Action = "sqs:SendMessage",
    Resource = aws_sqs_queue.review.arn, Condition = { ArnEquals = { "aws:SourceArn" = aws_cloudwatch_event_rule.review.arn } }
  }] })
}
resource "aws_cloudwatch_event_target" "review" {
  rule       = aws_cloudwatch_event_rule.review.name
  target_id  = "review-queue"
  arn        = aws_sqs_queue.review.arn
  depends_on = [aws_sqs_queue_policy.review]
}
resource "aws_iam_role" "worker" {
  name               = "pix-worker"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/pix-worker"
  retention_in_days = 14
}
resource "aws_iam_role_policy" "worker" {
  name = "pix-worker-data"
  role = aws_iam_role.worker.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"], Resource = aws_dynamodb_table.usage.arn },
    { Effect = "Allow", Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"], Resource = aws_sqs_queue.jobs.arn },
    { Effect = "Allow", Action = ["logs:CreateLogStream", "logs:PutLogEvents"], Resource = "${aws_cloudwatch_log_group.worker.arn}:*" }
  ] })
}
resource "aws_lambda_function" "worker" {
  function_name                  = "pix-worker"
  role                           = aws_iam_role.worker.arn
  handler                        = "worker.safe"
  runtime                        = "python3.12"
  filename                       = "worker.zip"
  source_code_hash               = filebase64sha256("worker.zip")
  timeout                        = 10
  reserved_concurrent_executions = 4
  environment { variables = { TABLE_NAME = aws_dynamodb_table.usage.name } }
}
resource "aws_lambda_event_source_mapping" "jobs" {
  event_source_arn = aws_sqs_queue.jobs.arn
  function_name    = aws_lambda_function.worker.arn
  batch_size       = 1
  # Keep the probe message available for the local worker during the review.
  enabled    = false
  depends_on = [aws_iam_role_policy.worker]
}
output "core" {
  value = {
    bucket = aws_s3_bucket.media.id, distribution = aws_cloudfront_distribution.media.id, cdn_arn = aws_cloudfront_distribution.media.arn,
    oac    = aws_cloudfront_origin_access_control.media.id, table = aws_dynamodb_table.usage.name, topic = aws_sns_topic.uploads.arn,
    jobs   = aws_sqs_queue.jobs.url, failed = aws_sqs_queue.failed.arn, review = aws_sqs_queue.review.url,
    rule   = aws_cloudwatch_event_rule.review.name, mapping = aws_lambda_event_source_mapping.jobs.uuid, worker = aws_lambda_function.worker.function_name
  }
}
