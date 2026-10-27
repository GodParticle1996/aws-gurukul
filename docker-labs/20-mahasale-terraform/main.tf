terraform {
  backend "local" { path = ".lab/state.tfstate" }
  required_version = ">= 1.17.0"
  required_providers { aws = { source = "hashicorp/aws", version = "= 6.70.0" } }
}
variable "moto_endpoint" {
  type = string
  validation {
    condition     = can(regex("^http://127[.]0[.]0[.]1:[0-9]+$", var.moto_endpoint))
    error_message = "Use only the owned loopback Moto endpoint."
  }
}
variable "prefix" { type = string }
variable "native_alarms" {
  type    = bool
  default = false
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
    ec2        = var.moto_endpoint
    elbv2      = var.moto_endpoint
    cloudfront = var.moto_endpoint
    s3         = var.moto_endpoint
    sqs        = var.moto_endpoint
    sns        = var.moto_endpoint
    cloudwatch = var.moto_endpoint
    wafv2      = var.moto_endpoint
    sts        = var.moto_endpoint
  }
}
resource "aws_vpc" "shop" { cidr_block = "10.220.0.0/16" }
resource "aws_subnet" "alb" {
  count                   = 2
  vpc_id                  = aws_vpc.shop.id
  cidr_block              = "10.220.${count.index + 1}.0/24"
  availability_zone       = "us-east-1${count.index == 0 ? "a" : "b"}"
  map_public_ip_on_launch = false
}
resource "aws_lb" "shop" {
  name               = var.prefix
  internal           = true
  load_balancer_type = "application"
  subnets            = aws_subnet.alb[*].id
}
# No live listener/application is claimed by this isolated control-plane extension lab.
resource "aws_s3_bucket" "images" { bucket = "${var.prefix}-images" }
resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_cloudfront_origin_access_control" "images" {
  name                              = var.prefix
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
resource "aws_cloudfront_distribution" "images" {
  enabled             = true
  wait_for_deployment = false
  origin {
    domain_name              = aws_s3_bucket.images.bucket_regional_domain_name
    origin_id                = "private-images"
    origin_access_control_id = aws_cloudfront_origin_access_control.images.id
  }
  default_cache_behavior {
    target_origin_id       = "private-images"
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
resource "aws_s3_bucket_policy" "images" {
  bucket = aws_s3_bucket.images.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "cloudfront.amazonaws.com" }, Action = "s3:GetObject", Resource = "${aws_s3_bucket.images.arn}/*", Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.images.arn } } }] })
}
resource "aws_wafv2_web_acl" "login" {
  name  = var.prefix
  scope = "REGIONAL"
  default_action {
    allow {}
  }
  rule {
    name     = "Common"
    priority = 0
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "Common"
    }
  }
  rule {
    name     = "LoginRate"
    priority = 1
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = 100
        evaluation_window_sec = 60
        aggregate_key_type    = "IP"
        scope_down_statement {
          byte_match_statement {
            positional_constraint = "EXACTLY"
            search_string         = "/login"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      sampled_requests_enabled   = true
      metric_name                = "LoginRate"
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    sampled_requests_enabled   = true
    metric_name                = "ShopLogin"
  }
}
resource "aws_wafv2_web_acl_association" "login" {
  resource_arn = aws_lb.shop.arn
  web_acl_arn  = aws_wafv2_web_acl.login.arn
}
resource "aws_sqs_queue" "dead" {
  name                      = "${var.prefix}-dead"
  message_retention_seconds = 1209600
}
resource "aws_sqs_queue" "work" {
  for_each                   = toset(["one", "five"])
  name                       = "${var.prefix}-${each.key}"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 345600
  redrive_policy             = jsonencode({ deadLetterTargetArn = aws_sqs_queue.dead.arn, maxReceiveCount = 3 })
}
resource "aws_sns_topic" "alerts" { name = "${var.prefix}-alerts" }
resource "aws_sqs_queue" "alert_sink" {
  name                       = "${var.prefix}-alert-sink"
  visibility_timeout_seconds = 60
}
resource "aws_sqs_queue_policy" "alerts" {
  queue_url = aws_sqs_queue.alert_sink.id
  policy    = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "sns.amazonaws.com" }, Action = "sqs:SendMessage", Resource = aws_sqs_queue.alert_sink.arn, Condition = { ArnEquals = { "aws:SourceArn" = aws_sns_topic.alerts.arn } } }] })
}
resource "aws_sns_topic_subscription" "alerts" {
  topic_arn            = aws_sns_topic.alerts.arn
  protocol             = "sqs"
  endpoint             = aws_sqs_queue.alert_sink.arn
  raw_message_delivery = true
  depends_on           = [aws_sqs_queue_policy.alerts]
}
resource "aws_cloudwatch_metric_alarm" "latency" {
  alarm_actions                         = [aws_sns_topic.alerts.arn]
  count                                 = var.native_alarms ? 1 : 0
  alarm_name                            = "${var.prefix}-p95"
  namespace                             = "AWS/ApplicationELB"
  metric_name                           = "TargetResponseTime"
  extended_statistic                    = "p95"
  comparison_operator                   = "GreaterThanThreshold"
  threshold                             = 0.4
  unit                                  = "Seconds"
  period                                = 60
  evaluation_periods                    = 3
  datapoints_to_alarm                   = 2
  treat_missing_data                    = "missing"
  evaluate_low_sample_count_percentiles = "ignore"
  dimensions                            = { LoadBalancer = aws_lb.shop.arn_suffix }
}
resource "aws_cloudwatch_metric_alarm" "queue_age" {
  alarm_actions       = [aws_sns_topic.alerts.arn]
  count               = var.native_alarms ? 1 : 0
  alarm_name          = "${var.prefix}-queue-age"
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateAgeOfOldestMessage"
  statistic           = "Maximum"
  comparison_operator = "GreaterThanThreshold"
  threshold           = 120
  unit                = "Seconds"
  period              = 60
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  treat_missing_data  = "notBreaching"
  dimensions          = { QueueName = aws_sqs_queue.work["five"].name }
}
output "review" {
  value = { alerts_topic = aws_sns_topic.alerts.arn, alert_queue = aws_sqs_queue.alert_sink.url, vpc = aws_vpc.shop.id, alb = aws_lb.shop.arn, bucket = aws_s3_bucket.images.id, distribution = aws_cloudfront_distribution.images.id, distribution_arn = aws_cloudfront_distribution.images.arn, oac = aws_cloudfront_origin_access_control.images.id, acl_id = aws_wafv2_web_acl.login.id, acl_name = aws_wafv2_web_acl.login.name, queues = { for k, q in aws_sqs_queue.work : k => q.url }, dead = aws_sqs_queue.dead.url, alarms = ["${var.prefix}-p95", "${var.prefix}-queue-age"] }
}
