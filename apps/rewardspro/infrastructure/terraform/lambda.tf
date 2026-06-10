# Lambda Functions Configuration

# Order Queue Processor Lambda
resource "aws_lambda_function" "order_queue_processor" {
  count = var.enable_sqs ? 1 : 0

  function_name = "${local.name_prefix}-order-queue-processor"
  description   = "Processes order webhooks from SQS queue"

  runtime     = "nodejs20.x"
  handler     = "order-queue-processor.handler"
  memory_size = var.lambda_memory_size
  timeout     = var.lambda_timeout

  role = aws_iam_role.lambda_execution_role.arn

  # Placeholder for code - update via CI/CD or manual deployment
  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      AURORA_RESOURCE_ARN   = var.aurora_resource_arn
      AURORA_SECRET_ARN     = var.aurora_secret_arn
      AURORA_DATABASE_NAME  = var.aurora_database_name
      VERCEL_APP_URL        = var.vercel_app_url
      INTERNAL_API_SECRET   = var.internal_api_secret
      NODE_OPTIONS          = "--enable-source-maps"
    }
  }

  # Reserved concurrency to prevent overwhelming downstream services
  reserved_concurrent_executions = 10

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-order-queue-processor"
    Type = "SQSConsumer"
  })
}

# SQS Trigger for Order Queue Processor
resource "aws_lambda_event_source_mapping" "order_queue_trigger" {
  count = var.enable_sqs ? 1 : 0

  event_source_arn = aws_sqs_queue.order_queue[0].arn
  function_name    = aws_lambda_function.order_queue_processor[0].arn
  enabled          = true

  batch_size                         = 10
  maximum_batching_window_in_seconds = 5

  # Enable partial batch response
  function_response_types = ["ReportBatchItemFailures"]

  # Scaling configuration
  scaling_config {
    maximum_concurrency = 10
  }
}

# Cron Dispatcher Lambda
resource "aws_lambda_function" "cron_dispatcher" {
  count = var.enable_eventbridge ? 1 : 0

  function_name = "${local.name_prefix}-cron-dispatcher"
  description   = "Dispatches cron jobs via EventBridge"

  runtime     = "nodejs20.x"
  handler     = "cron-dispatcher.handler"
  memory_size = 256
  timeout     = 300 # 5 minutes

  role = aws_iam_role.lambda_execution_role.arn

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      AWS_DYNAMODB_LOCKS_TABLE = var.enable_dynamodb_locks ? aws_dynamodb_table.cron_locks[0].name : ""
      VERCEL_APP_URL           = var.vercel_app_url
      CRON_SECRET              = var.cron_secret
      NODE_OPTIONS             = "--enable-source-maps"
    }
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cron-dispatcher"
    Type = "CronDispatcher"
  })
}

# Placeholder Lambda code (to be replaced via CI/CD)
data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda_placeholder.zip"

  source {
    content  = "exports.handler = async () => ({ statusCode: 200, body: 'Placeholder - deploy actual code' });"
    filename = "index.js"
  }
}

# CloudWatch Log Groups for Lambda
resource "aws_cloudwatch_log_group" "order_queue_processor_logs" {
  count = var.enable_sqs ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.order_queue_processor[0].function_name}"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_cloudwatch_log_group" "cron_dispatcher_logs" {
  count = var.enable_eventbridge ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.cron_dispatcher[0].function_name}"
  retention_in_days = 30

  tags = local.common_tags
}

# =============================================================================
# Customer Webhook Processor Lambda (EventBridge triggered)
# =============================================================================
# Processes customer webhooks (create/update/delete) from Shopify EventBridge

resource "aws_lambda_function" "customer_webhook_processor" {
  count = var.enable_eventbridge ? 1 : 0

  function_name = "${local.name_prefix}-customer-webhook-processor"
  description   = "Processes customer webhooks from Shopify via EventBridge"

  runtime     = "nodejs20.x"
  handler     = "process-customer-webhook.handler"
  memory_size = 256
  timeout     = 60 # 1 minute - customer webhooks are fast

  role = aws_iam_role.lambda_execution_role.arn

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      AURORA_RESOURCE_ARN  = var.aurora_resource_arn
      AURORA_SECRET_ARN    = var.aurora_secret_arn
      AURORA_DATABASE_NAME = var.aurora_database_name
      NODE_OPTIONS         = "--enable-source-maps"
    }
  }

  # Reserved concurrency for customer webhooks
  reserved_concurrent_executions = 20

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-customer-webhook-processor"
    Type = "EventBridgeWebhook"
  })
}

# CloudWatch Log Group for Customer Webhook Processor
resource "aws_cloudwatch_log_group" "customer_webhook_processor_logs" {
  count = var.enable_eventbridge ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.customer_webhook_processor[0].function_name}"
  retention_in_days = 30

  tags = local.common_tags
}

# =============================================================================
# EventBridge Rules for Customer Webhooks (Shopify Partner Events)
# =============================================================================
# These rules capture Shopify webhooks delivered via EventBridge Partner

# EventBridge Rule: Customer Create Webhook
resource "aws_cloudwatch_event_rule" "customer_create_webhook" {
  count = var.enable_eventbridge ? 1 : 0

  name        = "${local.name_prefix}-webhook-customer-create"
  description = "Capture Shopify customer/create webhooks"

  # Pattern matches Shopify Partner EventBridge events
  # Note: You'll need to replace with your actual Shopify Partner Event Source ARN
  event_pattern = jsonencode({
    source = [{
      prefix = "aws.partner/shopify.com"
    }]
    detail-type = ["shopifyWebhook"]
    detail = {
      metadata = {
        "X-Shopify-Topic" = ["customers/create"]
      }
    }
  })

  tags = merge(local.common_tags, {
    WebhookTopic = "customers/create"
  })
}

resource "aws_cloudwatch_event_target" "customer_create_webhook" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.customer_create_webhook[0].name
  target_id = "CustomerWebhookProcessor"
  arn       = aws_lambda_function.customer_webhook_processor[0].arn
}

# EventBridge Rule: Customer Update Webhook
resource "aws_cloudwatch_event_rule" "customer_update_webhook" {
  count = var.enable_eventbridge ? 1 : 0

  name        = "${local.name_prefix}-webhook-customer-update"
  description = "Capture Shopify customer/update webhooks"

  event_pattern = jsonencode({
    source = [{
      prefix = "aws.partner/shopify.com"
    }]
    detail-type = ["shopifyWebhook"]
    detail = {
      metadata = {
        "X-Shopify-Topic" = ["customers/update"]
      }
    }
  })

  tags = merge(local.common_tags, {
    WebhookTopic = "customers/update"
  })
}

resource "aws_cloudwatch_event_target" "customer_update_webhook" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.customer_update_webhook[0].name
  target_id = "CustomerWebhookProcessor"
  arn       = aws_lambda_function.customer_webhook_processor[0].arn
}

# EventBridge Rule: Customer Delete Webhook
resource "aws_cloudwatch_event_rule" "customer_delete_webhook" {
  count = var.enable_eventbridge ? 1 : 0

  name        = "${local.name_prefix}-webhook-customer-delete"
  description = "Capture Shopify customer/delete webhooks"

  event_pattern = jsonencode({
    source = [{
      prefix = "aws.partner/shopify.com"
    }]
    detail-type = ["shopifyWebhook"]
    detail = {
      metadata = {
        "X-Shopify-Topic" = ["customers/delete"]
      }
    }
  })

  tags = merge(local.common_tags, {
    WebhookTopic = "customers/delete"
  })
}

resource "aws_cloudwatch_event_target" "customer_delete_webhook" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.customer_delete_webhook[0].name
  target_id = "CustomerWebhookProcessor"
  arn       = aws_lambda_function.customer_webhook_processor[0].arn
}

# Lambda permission for EventBridge to invoke Customer Webhook Processor
resource "aws_lambda_permission" "eventbridge_customer_webhook" {
  count = var.enable_eventbridge ? 1 : 0

  statement_id  = "AllowEventBridgeCustomerWebhook"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.customer_webhook_processor[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = "arn:aws:events:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:rule/${local.name_prefix}-webhook-*"
}

# =============================================================================
# Lambda Error Alarms (Legacy - kept for backwards compatibility)
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "lambda_errors_alarm" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Lambda function errors exceed threshold"

  dimensions = {
    FunctionName = aws_lambda_function.order_queue_processor[0].function_name
  }

  tags = local.common_tags
}

# =============================================================================
# Email Queue Processor Lambda (SQS triggered)
# =============================================================================
# Processes emails asynchronously from the email queue

resource "aws_lambda_function" "email_queue_processor" {
  count = var.enable_sqs ? 1 : 0

  function_name = "${local.name_prefix}-email-queue-processor"
  description   = "Processes email notifications from SQS queue"

  runtime     = "nodejs20.x"
  handler     = "email-queue-processor.handler"
  memory_size = 256
  timeout     = 60 # 1 minute - email sending is fast

  role = aws_iam_role.lambda_execution_role.arn

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      SENDGRID_API_KEY     = var.sendgrid_api_key
      SENDGRID_FROM_EMAIL  = var.sendgrid_from_email
      SES_FROM_EMAIL       = var.ses_from_email
      EMAIL_PROVIDER       = var.email_provider
      NODE_OPTIONS         = "--enable-source-maps"
      # Aurora connection for idempotency checks
      AURORA_RESOURCE_ARN  = var.aurora_resource_arn
      AURORA_SECRET_ARN    = var.aurora_secret_arn
      AURORA_DATABASE_NAME = var.aurora_database_name
      # DynamoDB for rate limiting
      DYNAMODB_RATE_LIMIT_TABLE = var.enable_dynamodb_locks ? aws_dynamodb_table.rate_limits[0].name : ""
    }
  }

  # Reserved concurrency to prevent overwhelming email provider
  reserved_concurrent_executions = 5

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-email-queue-processor"
    Type = "SQSConsumer"
  })
}

# SQS Trigger for Email Queue Processor
resource "aws_lambda_event_source_mapping" "email_queue_trigger" {
  count = var.enable_sqs ? 1 : 0

  event_source_arn = aws_sqs_queue.email_queue[0].arn
  function_name    = aws_lambda_function.email_queue_processor[0].arn
  enabled          = true

  batch_size                         = 10
  maximum_batching_window_in_seconds = 5

  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 5
  }
}

# CloudWatch Log Group for Email Queue Processor
resource "aws_cloudwatch_log_group" "email_queue_processor_logs" {
  count = var.enable_sqs ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.email_queue_processor[0].function_name}"
  retention_in_days = 30

  tags = local.common_tags
}

# =============================================================================
# Klaviyo Queue Processor Lambda (SQS triggered)
# =============================================================================
# Processes Klaviyo events asynchronously from the queue

resource "aws_lambda_function" "klaviyo_queue_processor" {
  count = var.enable_sqs ? 1 : 0

  function_name = "${local.name_prefix}-klaviyo-queue-processor"
  description   = "Processes Klaviyo sync events from SQS queue"

  runtime     = "nodejs20.x"
  handler     = "klaviyo-queue-processor.handler"
  memory_size = 256
  timeout     = 120 # 2 minutes - Klaviyo API can be slow

  role = aws_iam_role.lambda_execution_role.arn

  filename         = data.archive_file.lambda_placeholder.output_path
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256

  environment {
    variables = {
      KLAVIYO_API_KEY  = var.klaviyo_api_key
      NODE_OPTIONS     = "--enable-source-maps"
      # Aurora connection for idempotency checks
      AURORA_RESOURCE_ARN  = var.aurora_resource_arn
      AURORA_SECRET_ARN    = var.aurora_secret_arn
      AURORA_DATABASE_NAME = var.aurora_database_name
      # DynamoDB for rate limiting
      DYNAMODB_RATE_LIMIT_TABLE = var.enable_dynamodb_locks ? aws_dynamodb_table.rate_limits[0].name : ""
    }
  }

  # Reserved concurrency to respect Klaviyo rate limits
  reserved_concurrent_executions = 5

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-klaviyo-queue-processor"
    Type = "SQSConsumer"
  })
}

# SQS Trigger for Klaviyo Queue Processor
resource "aws_lambda_event_source_mapping" "klaviyo_queue_trigger" {
  count = var.enable_sqs ? 1 : 0

  event_source_arn = aws_sqs_queue.klaviyo_queue[0].arn
  function_name    = aws_lambda_function.klaviyo_queue_processor[0].arn
  enabled          = true

  batch_size                         = 10
  maximum_batching_window_in_seconds = 10

  function_response_types = ["ReportBatchItemFailures"]

  scaling_config {
    maximum_concurrency = 5
  }
}

# CloudWatch Log Group for Klaviyo Queue Processor
resource "aws_cloudwatch_log_group" "klaviyo_queue_processor_logs" {
  count = var.enable_sqs ? 1 : 0

  name              = "/aws/lambda/${aws_lambda_function.klaviyo_queue_processor[0].function_name}"
  retention_in_days = 30

  tags = local.common_tags
}
