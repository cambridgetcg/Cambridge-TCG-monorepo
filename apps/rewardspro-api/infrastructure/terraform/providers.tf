provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(
      {
        Application = "RewardsPro API"
        Environment = var.environment
        ManagedBy   = "Terraform"
        Project     = var.project_name
      },
      var.tags,
    )
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}
