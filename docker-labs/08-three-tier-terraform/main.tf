terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}
# This training configuration is pinned to loopback Moto, with dummy credentials.
provider "aws" {
  region                      = "ap-south-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
  endpoints {
    ec2            = "http://127.0.0.1:4566"
    elbv2          = "http://127.0.0.1:4566"
    autoscaling    = "http://127.0.0.1:4566"
    rds            = "http://127.0.0.1:4566"
    s3             = "http://127.0.0.1:4566"
    iam            = "http://127.0.0.1:4566"
    sts            = "http://127.0.0.1:4566"
    kms            = "http://127.0.0.1:4566"
    secretsmanager = "http://127.0.0.1:4566"
  }
}
locals {
  name = "shopkaro-lab08"
  azs  = { a = "ap-south-1a", b = "ap-south-1b" }
  subnets = {
    public_a = { cidr = "10.8.1.0/24", az = "ap-south-1a" }
    public_b = { cidr = "10.8.2.0/24", az = "ap-south-1b" }
    app_a    = { cidr = "10.8.11.0/24", az = "ap-south-1a" }
    app_b    = { cidr = "10.8.12.0/24", az = "ap-south-1b" }
    db_a     = { cidr = "10.8.21.0/24", az = "ap-south-1a" }
    db_b     = { cidr = "10.8.22.0/24", az = "ap-south-1b" }
  }
}
resource "aws_vpc" "shop" {
  cidr_block           = "10.8.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = local.name }
}
resource "aws_subnet" "tier" {
  for_each                = local.subnets
  vpc_id                  = aws_vpc.shop.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false
  tags                    = { Name = "${local.name}-${each.key}" }
}
resource "aws_internet_gateway" "internet" { vpc_id = aws_vpc.shop.id }
resource "aws_route_table" "public" { vpc_id = aws_vpc.shop.id }
resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.internet.id
}
resource "aws_route_table_association" "public" {
  for_each       = local.azs
  subnet_id      = aws_subnet.tier["public_${each.key}"].id
  route_table_id = aws_route_table.public.id
}
resource "aws_eip" "nat" {
  for_each = local.azs
  domain   = "vpc"
}
# Zonal NAT example. Regional NAT is a separate option, discussed in vpcdeep.
resource "aws_nat_gateway" "egress" {
  for_each      = local.azs
  allocation_id = aws_eip.nat[each.key].id
  subnet_id     = aws_subnet.tier["public_${each.key}"].id
  depends_on    = [aws_internet_gateway.internet]
}
resource "aws_route_table" "app" {
  for_each = local.azs
  vpc_id   = aws_vpc.shop.id
}
resource "aws_route" "app_egress" {
  for_each               = local.azs
  route_table_id         = aws_route_table.app[each.key].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.egress[each.key].id
}
resource "aws_route_table_association" "app" {
  for_each       = local.azs
  route_table_id = aws_route_table.app[each.key].id
  subnet_id      = aws_subnet.tier["app_${each.key}"].id
}
# DB subnets inherit local-only main routing: no public/egress default route.
resource "aws_security_group" "alb" {
  name   = "${local.name}-alb"
  vpc_id = aws_vpc.shop.id
  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    protocol    = "tcp"
    from_port   = 8080
    to_port     = 8080
    cidr_blocks = ["10.8.11.0/24", "10.8.12.0/24"]
  }
}
resource "aws_security_group" "app" {
  name   = "${local.name}-app"
  vpc_id = aws_vpc.shop.id
  ingress {
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    security_groups = [aws_security_group.alb.id]
  }
  egress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    protocol    = "tcp"
    from_port   = 5432
    to_port     = 5432
    cidr_blocks = ["10.8.21.0/24", "10.8.22.0/24"]
  }
}
resource "aws_security_group" "db" {
  name   = "${local.name}-db"
  vpc_id = aws_vpc.shop.id
  ingress {
    protocol        = "tcp"
    from_port       = 5432
    to_port         = 5432
    security_groups = [aws_security_group.app.id]
  }
}
resource "aws_s3_bucket" "images" { bucket = "shopkaro-lab08-images-123456789012" }
resource "aws_s3_bucket_public_access_block" "images" {
  bucket                  = aws_s3_bucket.images.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_iam_role" "app" {
  name               = local.name
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "ec2.amazonaws.com" } }] })
}
resource "aws_iam_role_policy" "images" {
  name   = "images-read"
  role   = aws_iam_role.app.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["s3:GetObject"], Resource = "${aws_s3_bucket.images.arn}/catalog/*" }] })
}
# Emulator does not preload AWS-managed policies. Minimal modern SSM channel metadata only.
# Real managed-node setup should review AmazonSSMManagedInstanceCore and agent/network requirements.
resource "aws_iam_role_policy" "ssm" {
  name   = "ssm-channels-training"
  role   = aws_iam_role.app.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Action = ["ssm:UpdateInstanceInformation", "ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel", "ssmmessages:OpenDataChannel"], Resource = "*" }] })
}
resource "aws_iam_instance_profile" "app" {
  name = local.name
  role = aws_iam_role.app.name
}
variable "moto_ami_id" {
  type        = string
  description = "Image ID returned by the local Moto describe-images API; not a deployable production AMI."
}
data "aws_ami" "moto" {
  filter {
    name   = "image-id"
    values = [var.moto_ami_id]
  }
}
resource "aws_launch_template" "app" {
  name                   = local.name
  image_id               = data.aws_ami.moto.id
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.app.id]
  iam_instance_profile { name = aws_iam_instance_profile.app.name }
  metadata_options { http_tokens = "required" }
}
resource "aws_lb" "web" {
  name               = local.name
  load_balancer_type = "application"
  internal           = false
  subnets            = [for az in keys(local.azs) : aws_subnet.tier["public_${az}"].id]
  security_groups    = [aws_security_group.alb.id]
}
resource "aws_lb_target_group" "app" {
  name     = local.name
  port     = 8080
  protocol = "HTTP"
  vpc_id   = aws_vpc.shop.id
  health_check { path = "/healthz" }
}
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.web.arn
  port              = 80
  protocol          = "HTTP"
  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}
resource "aws_autoscaling_group" "app" {
  name                      = local.name
  min_size                  = 2
  max_size                  = 4
  desired_capacity          = 2
  vpc_zone_identifier       = [for az in keys(local.azs) : aws_subnet.tier["app_${az}"].id]
  target_group_arns         = [aws_lb_target_group.app.arn]
  health_check_type         = "ELB"
  health_check_grace_period = 120
  wait_for_capacity_timeout = "0"
  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }
}
resource "aws_db_subnet_group" "db" {
  name       = local.name
  subnet_ids = [for az in keys(local.azs) : aws_subnet.tier["db_${az}"].id]
}
resource "aws_db_instance" "orders" {
  identifier                  = local.name
  engine                      = "postgres"
  instance_class              = "db.t3.micro"
  allocated_storage           = 20
  username                    = "shopadmin"
  manage_master_user_password = true
  storage_encrypted           = true
  publicly_accessible         = false
  multi_az                    = true
  backup_retention_period     = 7
  db_subnet_group_name        = aws_db_subnet_group.db.name
  vpc_security_group_ids      = [aws_security_group.db.id]
  skip_final_snapshot         = true # disposable emulator only; use a retention policy in production
  deletion_protection         = false
}
output "review" {
  value = {
    vpc_id           = aws_vpc.shop.id
    app_sg           = aws_security_group.app.id
    db_sg            = aws_security_group.db.id
    app_subnets      = [for az in keys(local.azs) : aws_subnet.tier["app_${az}"].id]
    app_route_tables = { for az in keys(local.azs) : az => aws_route_table.app[az].id }
    nat_gateways     = { for az in keys(local.azs) : az => aws_nat_gateway.egress[az].id }
    bucket           = aws_s3_bucket.images.id
    role             = aws_iam_role.app.name
    asg              = aws_autoscaling_group.app.name
    db               = aws_db_instance.orders.identifier
    lb_arn           = aws_lb.web.arn
  }
}
