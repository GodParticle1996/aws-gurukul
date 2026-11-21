terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.70.0"
    }
  }
}

# Dono provider aliases lab.py banata hai. Har API apne Moto port par jaati hai.
resource "aws_kms_key" "orders" {
  provider                = aws.primary
  description             = "Lab 32 order envelope"
  multi_region            = true
  deletion_window_in_days = 7
}

resource "aws_kms_replica_key" "orders" {
  provider                = aws.standby
  primary_key_arn         = aws_kms_key.orders.arn
  deletion_window_in_days = 7
}

resource "aws_secretsmanager_secret" "checkout" {
  provider                = aws.primary
  name                    = "shopkaro/checkout"
  recovery_window_in_days = 0
  replica {
    region     = "ap-south-2"
    kms_key_id = aws_kms_replica_key.orders.arn
  }
}

resource "aws_secretsmanager_secret_version" "checkout" {
  provider      = aws.primary
  secret_id     = aws_secretsmanager_secret.checkout.id
  secret_string = "TEST-checkout-v1"
}

resource "aws_vpc" "standby" {
  provider   = aws.standby
  cidr_block = "10.32.0.0/16"
}

resource "aws_subnet" "standby" {
  provider          = aws.standby
  vpc_id            = aws_vpc.standby.id
  cidr_block        = "10.32.1.0/24"
  availability_zone = "ap-south-2a"
}

resource "aws_launch_template" "checkout" {
  provider      = aws.standby
  name          = "shopkaro-checkout"
  image_id      = "ami-0123456789abcdef0"
  instance_type = "t3.micro"
}

resource "aws_autoscaling_group" "checkout" {
  provider                  = aws.standby
  name                      = "checkout-dr"
  min_size                  = 3
  desired_capacity          = 3
  max_size                  = 6
  wait_for_capacity_timeout = "0"
  force_delete              = true
  vpc_zone_identifier       = [aws_subnet.standby.id]
  launch_template {
    id      = aws_launch_template.checkout.id
    version = "$Latest"
  }
}

resource "aws_route53_zone" "shop" {
  provider = aws.primary
  name     = "shopkaro.test"
}

# Dono resources ek hi naam lete hain. Drill poora apply hone ke baad chalegi.
locals {
  mumbai_probe = "mumbai.shopkaro.test"
}
resource "aws_route53_record" "mumbai" {
  provider = aws.primary
  zone_id  = aws_route53_zone.shop.zone_id
  name     = local.mumbai_probe
  type     = "A"
  ttl      = 30
  records  = ["192.0.2.10"]
}

resource "aws_route53_health_check" "checkout" {
  provider          = aws.primary
  fqdn              = local.mumbai_probe
  port              = 443
  type              = "HTTPS"
  resource_path     = "/ready"
  failure_threshold = 3
  request_interval  = 30
}

resource "aws_route53_record" "checkout" {
  provider       = aws.primary
  for_each       = { PRIMARY = "192.0.2.10", SECONDARY = "192.0.2.20" }
  zone_id        = aws_route53_zone.shop.zone_id
  name           = "checkout.shopkaro.test"
  type           = "A"
  ttl            = 30
  set_identifier = lower(each.key)
  records        = [each.value]
  health_check_id = each.key == "PRIMARY" ? aws_route53_health_check.checkout.id : null
  failover_routing_policy {
    type = each.key
  }
}

output "key_id" { value = aws_kms_key.orders.key_id }
output "zone_id" { value = aws_route53_zone.shop.zone_id }
output "check_id" { value = aws_route53_health_check.checkout.id }
