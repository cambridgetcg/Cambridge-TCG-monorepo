# RewardsPro Terraform Variables

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "eu-north-1"
}

variable "environment" {
  description = "Environment name (prod, staging, dev)"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["prod", "staging", "dev"], var.environment)
    error_message = "Environment must be one of: prod, staging, dev"
  }
}

# Aurora Database Configuration (existing)
variable "aurora_resource_arn" {
  description = "ARN of the Aurora cluster"
  type        = string
  sensitive   = true
}

variable "aurora_secret_arn" {
  description = "ARN of the Secrets Manager secret for Aurora credentials"
  type        = string
  sensitive   = true
}

variable "aurora_database_name" {
  description = "Name of the Aurora database"
  type        = string
  default     = "rewardspro"
}

# Vercel App Configuration
variable "vercel_app_url" {
  description = "URL of the Vercel deployment"
  type        = string
}

variable "cron_secret" {
  description = "Secret for authenticating cron job requests"
  type        = string
  sensitive   = true
}

variable "internal_api_secret" {
  description = "Secret for internal API authentication"
  type        = string
  sensitive   = true
}

# SQS Configuration
variable "sqs_message_retention_seconds" {
  description = "SQS message retention period in seconds"
  type        = number
  default     = 1209600 # 14 days
}

variable "sqs_visibility_timeout_seconds" {
  description = "SQS visibility timeout in seconds"
  type        = number
  default     = 300 # 5 minutes
}

variable "sqs_max_receive_count" {
  description = "Maximum receives before sending to DLQ"
  type        = number
  default     = 4
}

# DynamoDB Configuration
variable "dynamodb_billing_mode" {
  description = "DynamoDB billing mode (PAY_PER_REQUEST or PROVISIONED)"
  type        = string
  default     = "PAY_PER_REQUEST"
}

# Lambda Configuration
variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 300 # 5 minutes
}

# S3 Configuration
variable "s3_expiration_days" {
  description = "Days before transitioning exports to Glacier"
  type        = number
  default     = 90
}

# SES Configuration
variable "ses_from_email" {
  description = "Email address for sending SES emails"
  type        = string
  default     = ""
}

# VPC Configuration (for ElastiCache)
variable "vpc_id" {
  description = "VPC ID for ElastiCache (leave empty to skip ElastiCache)"
  type        = string
  default     = ""
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ElastiCache"
  type        = list(string)
  default     = []
}

# Feature Flags
variable "enable_sqs" {
  description = "Enable SQS order queue"
  type        = bool
  default     = true
}

variable "enable_dynamodb_locks" {
  description = "Enable DynamoDB for cron locks"
  type        = bool
  default     = true
}

variable "enable_s3_exports" {
  description = "Enable S3 for data exports"
  type        = bool
  default     = true
}

variable "enable_eventbridge" {
  description = "Enable EventBridge cron rules"
  type        = bool
  default     = true
}

variable "enable_elasticache" {
  description = "Enable ElastiCache Redis cluster"
  type        = bool
  default     = false # Requires VPC configuration
}

# Email Configuration
variable "sendgrid_api_key" {
  description = "SendGrid API key for email sending"
  type        = string
  default     = ""
  sensitive   = true
}

variable "sendgrid_from_email" {
  description = "From email address for SendGrid"
  type        = string
  default     = ""
}

variable "email_provider" {
  description = "Email provider to use (sendgrid, ses, or hybrid)"
  type        = string
  default     = "sendgrid"
}

# Klaviyo Configuration
variable "klaviyo_api_key" {
  description = "Klaviyo API key for event tracking"
  type        = string
  default     = ""
  sensitive   = true
}
