# CloudWatch Dashboard and Monitoring Resources

# =============================================================================
# CloudWatch Dashboard: Webhook Processing Overview
# =============================================================================

resource "aws_cloudwatch_dashboard" "webhook_monitoring" {
  count = var.enable_sqs && var.enable_eventbridge ? 1 : 0

  dashboard_name = "${local.name_prefix}-webhook-monitoring"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: SQS Queue Metrics
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 8
        height = 6
        properties = {
          title  = "SQS Order Queue Depth"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.order_queue[0].name, { label = "Pending Messages", color = "#1f77b4" }],
            [".", "ApproximateNumberOfMessagesNotVisible", ".", ".", { label = "In Flight", color = "#ff7f0e" }]
          ]
          stat   = "Average"
          period = 60
          view   = "timeSeries"
          stacked = false
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 0
        width  = 8
        height = 6
        properties = {
          title  = "SQS Dead Letter Queue"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", aws_sqs_queue.order_queue_dlq[0].name, { label = "DLQ Messages", color = "#d62728" }]
          ]
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
          annotations = {
            horizontal = [
              { label = "Alert Threshold", value = 1, color = "#d62728" }
            ]
          }
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 0
        width  = 8
        height = 6
        properties = {
          title  = "SQS Message Age"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/SQS", "ApproximateAgeOfOldestMessage", "QueueName", aws_sqs_queue.order_queue[0].name, { label = "Oldest Message (seconds)", color = "#9467bd" }]
          ]
          stat   = "Maximum"
          period = 60
          view   = "timeSeries"
        }
      },

      # Row 2: Lambda Metrics - Order Queue Processor
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 6
        height = 6
        properties = {
          title  = "Order Processor - Invocations"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.order_queue_processor[0].function_name, { label = "Invocations", color = "#2ca02c" }]
          ]
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 6
        width  = 6
        height = 6
        properties = {
          title  = "Order Processor - Errors"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.order_queue_processor[0].function_name, { label = "Errors", color = "#d62728" }]
          ]
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 6
        height = 6
        properties = {
          title  = "Order Processor - Duration (p95)"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.order_queue_processor[0].function_name, { label = "p95 Duration", stat = "p95", color = "#ff7f0e" }]
          ]
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 18
        y      = 6
        width  = 6
        height = 6
        properties = {
          title  = "Order Processor - Concurrent Executions"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "ConcurrentExecutions", "FunctionName", aws_lambda_function.order_queue_processor[0].function_name, { label = "Concurrent", color = "#17becf" }]
          ]
          stat   = "Maximum"
          period = 60
          view   = "timeSeries"
        }
      },

      # Row 3: Lambda Metrics - Customer Webhook Processor
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 6
        height = 6
        properties = {
          title  = "Customer Webhook - Invocations"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.customer_webhook_processor[0].function_name, { label = "Invocations", color = "#2ca02c" }]
          ]
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 12
        width  = 6
        height = 6
        properties = {
          title  = "Customer Webhook - Errors"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", aws_lambda_function.customer_webhook_processor[0].function_name, { label = "Errors", color = "#d62728" }]
          ]
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 6
        height = 6
        properties = {
          title  = "Customer Webhook - Duration (p95)"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", aws_lambda_function.customer_webhook_processor[0].function_name, { label = "p95 Duration", stat = "p95", color = "#ff7f0e" }]
          ]
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 18
        y      = 12
        width  = 6
        height = 6
        properties = {
          title  = "Cron Dispatcher - Invocations & Errors"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", aws_lambda_function.cron_dispatcher[0].function_name, { label = "Invocations", color = "#2ca02c" }],
            [".", "Errors", ".", ".", { label = "Errors", color = "#d62728" }]
          ]
          stat   = "Sum"
          period = 300
          view   = "timeSeries"
        }
      },

      # Row 4: DynamoDB Metrics
      {
        type   = "metric"
        x      = 0
        y      = 18
        width  = 8
        height = 6
        properties = {
          title  = "DynamoDB - Read/Write Units"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", aws_dynamodb_table.cron_locks[0].name, { label = "Read Units", color = "#1f77b4" }],
            [".", "ConsumedWriteCapacityUnits", ".", ".", { label = "Write Units", color = "#ff7f0e" }]
          ]
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 18
        width  = 8
        height = 6
        properties = {
          title  = "DynamoDB - Latency"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/DynamoDB", "SuccessfulRequestLatency", "TableName", aws_dynamodb_table.cron_locks[0].name, "Operation", "GetItem", { label = "GetItem", color = "#1f77b4" }],
            ["...", "PutItem", { label = "PutItem", color = "#ff7f0e" }]
          ]
          stat   = "Average"
          period = 60
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 16
        y      = 18
        width  = 8
        height = 6
        properties = {
          title  = "DynamoDB - Throttled Requests"
          region = data.aws_region.current.name
          metrics = [
            ["AWS/DynamoDB", "ThrottledRequests", "TableName", aws_dynamodb_table.cron_locks[0].name, { label = "Throttled", color = "#d62728" }]
          ]
          stat   = "Sum"
          period = 60
          view   = "timeSeries"
        }
      },

      # Row 5: Summary
      {
        type   = "text"
        x      = 0
        y      = 24
        width  = 24
        height = 2
        properties = {
          markdown = "## Quick Links\n- [SQS Console](https://eu-north-1.console.aws.amazon.com/sqs/v3/home?region=eu-north-1#/queues) | [Lambda Console](https://eu-north-1.console.aws.amazon.com/lambda/home?region=eu-north-1#/functions) | [CloudWatch Alarms](https://eu-north-1.console.aws.amazon.com/cloudwatch/home?region=eu-north-1#alarmsV2:) | [SNS Topics](https://eu-north-1.console.aws.amazon.com/sns/v3/home?region=eu-north-1#/topics)"
        }
      }
    ]
  })
}

# =============================================================================
# CloudWatch Log Insights Queries (Saved)
# =============================================================================

resource "aws_cloudwatch_query_definition" "webhook_errors" {
  count = var.enable_sqs && var.enable_eventbridge ? 1 : 0

  name = "${local.name_prefix}/webhook-errors"

  log_group_names = [
    "/aws/lambda/${local.name_prefix}-order-queue-processor",
    "/aws/lambda/${local.name_prefix}-customer-webhook-processor",
    "/aws/lambda/${local.name_prefix}-cron-dispatcher"
  ]

  query_string = <<-EOT
fields @timestamp, @message, @logStream
| filter @message like /(?i)(error|exception|failed)/
| sort @timestamp desc
| limit 100
EOT
}

resource "aws_cloudwatch_query_definition" "webhook_latency" {
  count = var.enable_sqs && var.enable_eventbridge ? 1 : 0

  name = "${local.name_prefix}/webhook-latency"

  log_group_names = [
    "/aws/lambda/${local.name_prefix}-order-queue-processor",
    "/aws/lambda/${local.name_prefix}-customer-webhook-processor"
  ]

  query_string = <<-EOT
fields @timestamp, @duration, @billedDuration, @memorySize, @maxMemoryUsed
| stats avg(@duration) as avg_duration,
        max(@duration) as max_duration,
        pct(@duration, 95) as p95_duration,
        pct(@duration, 99) as p99_duration
  by bin(5m)
| sort @timestamp desc
EOT
}

resource "aws_cloudwatch_query_definition" "dlq_analysis" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}/dlq-analysis"

  log_group_names = [
    "/aws/lambda/${local.name_prefix}-order-queue-processor"
  ]

  query_string = <<-EOT
fields @timestamp, @message
| filter @message like /DLQ|dead.letter|failed.*retry/
| parse @message "orderId: *," as orderId
| parse @message "shop: *," as shop
| parse @message "error: *" as error
| sort @timestamp desc
| limit 50
EOT
}

# =============================================================================
# Outputs
# =============================================================================

output "cloudwatch_dashboard_url" {
  description = "URL to the CloudWatch dashboard"
  value       = var.enable_sqs && var.enable_eventbridge ? "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${local.name_prefix}-webhook-monitoring" : null
}
