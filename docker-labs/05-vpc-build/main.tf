terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# Moto only. AWS_ENDPOINT_URL must point to the local emulator.
provider "aws" {
  region                      = "ap-south-1"
  skip_credentials_validation = true
  skip_requesting_account_id  = true
  skip_metadata_api_check     = true
  s3_use_path_style           = true
}

locals {
  subnets = {
    public_a  = { cidr = "10.0.1.0/24", az = "ap-south-1a", public = true }
    public_b  = { cidr = "10.0.2.0/24", az = "ap-south-1b", public = true }
    private_a = { cidr = "10.0.11.0/24", az = "ap-south-1a", public = false }
    private_b = { cidr = "10.0.12.0/24", az = "ap-south-1b", public = false }
  }
}

resource "aws_vpc" "shopkaro" {
  cidr_block = "10.0.0.0/16"
  tags       = { Name = "shopkaro-vpc-tf" }
}

resource "aws_subnet" "tier" {
  for_each          = local.subnets
  vpc_id            = aws_vpc.shopkaro.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az
  # Deliberately false even for public subnets: routing defines public/private.
  map_public_ip_on_launch = false
  tags                    = { Name = each.key }
}

resource "aws_internet_gateway" "internet" {
  vpc_id = aws_vpc.shopkaro.id
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.shopkaro.id
  tags   = { Name = "public" }
}

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.internet.id
}

resource "aws_route_table_association" "public" {
  for_each       = { for name, config in local.subnets : name => config if config.public }
  subnet_id      = aws_subnet.tier[each.key].id
  route_table_id = aws_route_table.public.id
}

# Private subnets inherit the new VPC's main table (local route only).
output "vpc_id" { value = aws_vpc.shopkaro.id }
output "public_route_table_id" { value = aws_route_table.public.id }
output "subnet_count" { value = length(aws_subnet.tier) }
