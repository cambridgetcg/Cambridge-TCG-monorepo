# RewardsPro AWS Infrastructure
# Terraform configuration for production-grade AWS services

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state storage (recommended for production)
  # Uncomment and configure for your S3 bucket
  # backend "s3" {
  #   bucket         = "rewardspro-terraform-state"
  #   key            = "infrastructure/terraform.tfstate"
  #   region         = "eu-north-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-state-lock"
  # }
}

# AWS Provider Configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "RewardsPro"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  }
}

# Data sources for existing resources
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

# Local variables
locals {
  name_prefix = "rewardspro-${var.environment}"
  common_tags = {
    Project     = "RewardsPro"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
