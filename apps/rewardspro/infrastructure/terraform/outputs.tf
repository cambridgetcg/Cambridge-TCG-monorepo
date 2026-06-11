# Terraform Outputs

# SQS Outputs
output "sqs_order_queue_url" {
  description = "URL of the SQS order processing queue"
  value       = var.enable_sqs ? aws_sqs_queue.order_queue[0].url : null
}

output "sqs_order_queue_arn" {
  description = "ARN of the SQS order processing queue"
  value       = var.enable_sqs ? aws_sqs_queue.order_queue[0].arn : null
}

output "sqs_dlq_url" {
  description = "URL of the SQS dead letter queue"
  value       = var.enable_sqs ? aws_sqs_queue.order_queue_dlq[0].url : null
}

output "sqs_dlq_arn" {
  description = "ARN of the SQS dead letter queue"
  value       = var.enable_sqs ? aws_sqs_queue.order_queue_dlq[0].arn : null
}

# Email Queue Outputs
output "sqs_email_queue_url" {
  description = "URL of the SQS email processing queue"
  value       = var.enable_sqs ? aws_sqs_queue.email_queue[0].url : null
}

output "sqs_email_queue_arn" {
  description = "ARN of the SQS email processing queue"
  value       = var.enable_sqs ? aws_sqs_queue.email_queue[0].arn : null
}

output "sqs_email_dlq_url" {
  description = "URL of the SQS email dead letter queue"
  value       = var.enable_sqs ? aws_sqs_queue.email_queue_dlq[0].url : null
}

# Klaviyo Queue Outputs
output "sqs_klaviyo_queue_url" {
  description = "URL of the SQS Klaviyo processing queue"
  value       = var.enable_sqs ? aws_sqs_queue.klaviyo_queue[0].url : null
}

output "sqs_klaviyo_queue_arn" {
  description = "ARN of the SQS Klaviyo processing queue"
  value       = var.enable_sqs ? aws_sqs_queue.klaviyo_queue[0].arn : null
}

output "sqs_klaviyo_dlq_url" {
  description = "URL of the SQS Klaviyo dead letter queue"
  value       = var.enable_sqs ? aws_sqs_queue.klaviyo_queue_dlq[0].url : null
}

# SNS Topic Outputs
output "sns_order_processed_topic_arn" {
  description = "ARN of the SNS order processed topic"
  value       = var.enable_sqs ? aws_sns_topic.order_processed[0].arn : null
}

output "sns_customer_updated_topic_arn" {
  description = "ARN of the SNS customer updated topic"
  value       = var.enable_sqs ? aws_sns_topic.customer_updated[0].arn : null
}

output "sns_tier_changed_topic_arn" {
  description = "ARN of the SNS tier changed topic"
  value       = var.enable_sqs ? aws_sns_topic.tier_changed[0].arn : null
}

output "sns_points_earned_topic_arn" {
  description = "ARN of the SNS points earned topic"
  value       = var.enable_sqs ? aws_sns_topic.points_earned[0].arn : null
}

# DynamoDB Outputs
output "dynamodb_locks_table_name" {
  description = "Name of the DynamoDB cron locks table"
  value       = var.enable_dynamodb_locks ? aws_dynamodb_table.cron_locks[0].name : null
}

output "dynamodb_locks_table_arn" {
  description = "ARN of the DynamoDB cron locks table"
  value       = var.enable_dynamodb_locks ? aws_dynamodb_table.cron_locks[0].arn : null
}

output "dynamodb_rate_limits_table_name" {
  description = "Name of the DynamoDB rate limits table"
  value       = var.enable_dynamodb_locks ? aws_dynamodb_table.rate_limits[0].name : null
}

output "dynamodb_rate_limits_table_arn" {
  description = "ARN of the DynamoDB rate limits table"
  value       = var.enable_dynamodb_locks ? aws_dynamodb_table.rate_limits[0].arn : null
}

# Lambda Outputs
output "lambda_order_queue_processor_arn" {
  description = "ARN of the order queue processor Lambda function"
  value       = var.enable_sqs ? aws_lambda_function.order_queue_processor[0].arn : null
}

output "lambda_cron_dispatcher_arn" {
  description = "ARN of the cron dispatcher Lambda function"
  value       = var.enable_eventbridge ? aws_lambda_function.cron_dispatcher[0].arn : null
}

output "lambda_customer_webhook_processor_arn" {
  description = "ARN of the customer webhook processor Lambda function"
  value       = var.enable_eventbridge ? aws_lambda_function.customer_webhook_processor[0].arn : null
}

output "lambda_email_queue_processor_arn" {
  description = "ARN of the email queue processor Lambda function"
  value       = var.enable_sqs ? aws_lambda_function.email_queue_processor[0].arn : null
}

output "lambda_klaviyo_queue_processor_arn" {
  description = "ARN of the Klaviyo queue processor Lambda function"
  value       = var.enable_sqs ? aws_lambda_function.klaviyo_queue_processor[0].arn : null
}

# S3 Outputs
output "s3_exports_bucket_name" {
  description = "Name of the S3 exports bucket"
  value       = var.enable_s3_exports ? aws_s3_bucket.exports[0].id : null
}

output "s3_exports_bucket_arn" {
  description = "ARN of the S3 exports bucket"
  value       = var.enable_s3_exports ? aws_s3_bucket.exports[0].arn : null
}

# IAM Outputs
output "lambda_execution_role_arn" {
  description = "ARN of the Lambda execution role"
  value       = aws_iam_role.lambda_execution_role.arn
}

output "vercel_service_access_key_id" {
  description = "Access key ID for Vercel service account"
  value       = aws_iam_access_key.vercel_service.id
  sensitive   = true
}

output "vercel_service_secret_access_key" {
  description = "Secret access key for Vercel service account"
  value       = aws_iam_access_key.vercel_service.secret
  sensitive   = true
}

# Environment Variables for Vercel (formatted for easy copy-paste)
output "vercel_environment_variables" {
  description = "Environment variables to set in Vercel"
  value = {
    AWS_REGION              = var.aws_region
    AWS_ACCESS_KEY_ID       = aws_iam_access_key.vercel_service.id
    AWS_SQS_ORDER_QUEUE_URL = var.enable_sqs ? aws_sqs_queue.order_queue[0].url : ""
    AWS_SQS_DLQ_URL         = var.enable_sqs ? aws_sqs_queue.order_queue_dlq[0].url : ""
    AWS_SQS_EMAIL_QUEUE_URL = var.enable_sqs ? aws_sqs_queue.email_queue[0].url : ""
    AWS_SQS_EMAIL_DLQ_URL   = var.enable_sqs ? aws_sqs_queue.email_queue_dlq[0].url : ""
    AWS_SQS_KLAVIYO_QUEUE_URL = var.enable_sqs ? aws_sqs_queue.klaviyo_queue[0].url : ""
    AWS_SQS_KLAVIYO_DLQ_URL = var.enable_sqs ? aws_sqs_queue.klaviyo_queue_dlq[0].url : ""
    AWS_SNS_ORDER_PROCESSED_TOPIC_ARN = var.enable_sqs ? aws_sns_topic.order_processed[0].arn : ""
    AWS_SNS_CUSTOMER_UPDATED_TOPIC_ARN = var.enable_sqs ? aws_sns_topic.customer_updated[0].arn : ""
    AWS_SNS_TIER_CHANGED_TOPIC_ARN = var.enable_sqs ? aws_sns_topic.tier_changed[0].arn : ""
    AWS_SNS_POINTS_EARNED_TOPIC_ARN = var.enable_sqs ? aws_sns_topic.points_earned[0].arn : ""
    AWS_DYNAMODB_LOCKS_TABLE = var.enable_dynamodb_locks ? aws_dynamodb_table.cron_locks[0].name : ""
    AWS_S3_EXPORTS_BUCKET   = var.enable_s3_exports ? aws_s3_bucket.exports[0].id : ""
    USE_SQS_QUEUE           = var.enable_sqs ? "true" : "false"
    USE_SQS_EMAIL_QUEUE     = var.enable_sqs ? "true" : "false"
    USE_SQS_KLAVIYO_QUEUE   = var.enable_sqs ? "true" : "false"
    USE_SNS_EVENTS          = var.enable_sqs ? "true" : "false"
    USE_DYNAMODB_LOCKS      = var.enable_dynamodb_locks ? "true" : "false"
  }
  sensitive = true
}

# Summary
output "infrastructure_summary" {
  description = "Summary of deployed infrastructure"
  value = {
    environment      = var.environment
    region           = var.aws_region
    sqs_enabled      = var.enable_sqs
    dynamodb_enabled = var.enable_dynamodb_locks
    s3_enabled       = var.enable_s3_exports
    eventbridge_enabled = var.enable_eventbridge
  }
}
