terraform {
  required_version = ">= 1.5.7, < 2.0.0"

  # Supply bucket, key, region, and DynamoDB lock-table settings at init time.
  # Keeping account-specific values out of source makes this a partial backend.
  backend "s3" {
    encrypt = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.92"
    }
  }
}
