# SNS Topics for Alerting and Notifications

# =============================================================================
# SNS Topic: Webhook Alerts
# =============================================================================
# Central topic for all webhook-related alerts (DLQ, errors, failures)

resource "aws_sns_topic" "webhook_alerts" {
  name = "${local.name_prefix}-webhook-alerts"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-webhook-alerts"
    Type = "Alerting"
  })
}

# SNS Topic Policy - Allow CloudWatch Alarms and Lambda to publish
resource "aws_sns_topic_policy" "webhook_alerts" {
  arn = aws_sns_topic.webhook_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudWatchAlarms"
        Effect = "Allow"
        Principal = {
          Service = "cloudwatch.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.webhook_alerts.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:cloudwatch:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alarm:${local.name_prefix}-*"
          }
        }
      },
      {
        Sid    = "AllowLambdaPublish"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.webhook_alerts.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
          }
        }
      }
    ]
  })
}

# =============================================================================
# Email Subscription (Optional - requires verification)
# =============================================================================
# Uncomment and set var.alert_email to enable email notifications

# resource "aws_sns_topic_subscription" "webhook_alerts_email" {
#   count     = var.alert_email != "" ? 1 : 0
#   topic_arn = aws_sns_topic.webhook_alerts.arn
#   protocol  = "email"
#   endpoint  = var.alert_email
# }

# =============================================================================
# CloudWatch Alarms with SNS Notifications
# =============================================================================

# DLQ Messages Alarm - Alert when messages land in DLQ
resource "aws_cloudwatch_metric_alarm" "dlq_messages_alert" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-dlq-messages-alert"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Alert when messages appear in the Dead Letter Queue"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.order_queue_dlq[0].name
  }

  alarm_actions = [aws_sns_topic.webhook_alerts.arn]
  ok_actions    = [aws_sns_topic.webhook_alerts.arn]

  tags = merge(local.common_tags, {
    AlertType = "DLQ"
  })
}

# SQS Queue Backlog Alarm - Alert when queue is backing up
resource "aws_cloudwatch_metric_alarm" "queue_backlog_alert" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-queue-backlog-alert"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300 # 5 minutes
  statistic           = "Average"
  threshold           = 50
  alarm_description   = "Alert when SQS queue has more than 50 pending messages"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.order_queue[0].name
  }

  alarm_actions = [aws_sns_topic.webhook_alerts.arn]

  tags = merge(local.common_tags, {
    AlertType = "QueueBacklog"
  })
}

# Lambda Error Rate Alarm - Alert on high error rate
resource "aws_cloudwatch_metric_alarm" "lambda_error_rate_alert" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-error-rate-alert"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 10 # 10% error rate

  metric_query {
    id          = "error_rate"
    expression  = "(errors / invocations) * 100"
    label       = "Error Rate %"
    return_data = true
  }

  metric_query {
    id = "errors"
    metric {
      metric_name = "Errors"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.order_queue_processor[0].function_name
      }
    }
  }

  metric_query {
    id = "invocations"
    metric {
      metric_name = "Invocations"
      namespace   = "AWS/Lambda"
      period      = 300
      stat        = "Sum"
      dimensions = {
        FunctionName = aws_lambda_function.order_queue_processor[0].function_name
      }
    }
  }

  alarm_description  = "Alert when Lambda error rate exceeds 10%"
  treat_missing_data = "notBreaching"

  alarm_actions = [aws_sns_topic.webhook_alerts.arn]

  tags = merge(local.common_tags, {
    AlertType = "LambdaErrors"
  })
}

# Lambda Duration Alarm - Alert on slow processing
resource "aws_cloudwatch_metric_alarm" "lambda_duration_alert" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-lambda-duration-alert"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  extended_statistic  = "p95"
  threshold           = 60000 # 60 seconds p95
  alarm_description   = "Alert when Lambda p95 duration exceeds 60 seconds"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.order_queue_processor[0].function_name
  }

  alarm_actions = [aws_sns_topic.webhook_alerts.arn]

  tags = merge(local.common_tags, {
    AlertType = "LambdaDuration"
  })
}

# Customer Webhook Lambda Errors
resource "aws_cloudwatch_metric_alarm" "customer_webhook_errors_alert" {
  count = var.enable_eventbridge ? 1 : 0

  alarm_name          = "${local.name_prefix}-customer-webhook-errors-alert"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 3
  alarm_description   = "Alert when customer webhook Lambda has errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.customer_webhook_processor[0].function_name
  }

  alarm_actions = [aws_sns_topic.webhook_alerts.arn]

  tags = merge(local.common_tags, {
    AlertType = "CustomerWebhookErrors"
  })
}

# =============================================================================
# SNS Topics for Event Fan-out
# =============================================================================
# These topics enable decoupled event processing - multiple handlers can
# subscribe to a single event without blocking the main webhook flow.
#
# Architecture:
# Webhook → SNS Topic → Multiple SQS Queues → Independent Lambda Handlers
#                    ├→ Email Queue
#                    ├→ Klaviyo Queue
#                    └→ Analytics (direct)

# SNS Topic: Order Processed
# Triggered after an order webhook is successfully processed
resource "aws_sns_topic" "order_processed" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-order-processed"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-order-processed"
    Type = "EventFanout"
  })
}

# SNS Topic: Customer Updated
# Triggered after customer create/update webhooks
resource "aws_sns_topic" "customer_updated" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-customer-updated"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-customer-updated"
    Type = "EventFanout"
  })
}

# SNS Topic: Tier Changed
# Triggered when a customer's tier changes (upgrade/downgrade)
resource "aws_sns_topic" "tier_changed" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-tier-changed"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-tier-changed"
    Type = "EventFanout"
  })
}

# SNS Topic: Points Earned
# Triggered when a customer earns points/cashback
resource "aws_sns_topic" "points_earned" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-points-earned"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-points-earned"
    Type = "EventFanout"
  })
}

# =============================================================================
# SNS Topic Policies - Allow Vercel/Lambda to publish
# =============================================================================

resource "aws_sns_topic_policy" "order_processed" {
  count = var.enable_sqs ? 1 : 0

  arn = aws_sns_topic.order_processed[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowVercelPublish"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_user.vercel_service.arn
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.order_processed[0].arn
      },
      {
        Sid    = "AllowLambdaPublish"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.order_processed[0].arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic_policy" "customer_updated" {
  count = var.enable_sqs ? 1 : 0

  arn = aws_sns_topic.customer_updated[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowVercelPublish"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_user.vercel_service.arn
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.customer_updated[0].arn
      },
      {
        Sid    = "AllowLambdaPublish"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.customer_updated[0].arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic_policy" "tier_changed" {
  count = var.enable_sqs ? 1 : 0

  arn = aws_sns_topic.tier_changed[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowVercelPublish"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_user.vercel_service.arn
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.tier_changed[0].arn
      },
      {
        Sid    = "AllowLambdaPublish"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.tier_changed[0].arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
          }
        }
      }
    ]
  })
}

resource "aws_sns_topic_policy" "points_earned" {
  count = var.enable_sqs ? 1 : 0

  arn = aws_sns_topic.points_earned[0].arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowVercelPublish"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_user.vercel_service.arn
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.points_earned[0].arn
      },
      {
        Sid    = "AllowLambdaPublish"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.points_earned[0].arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
          }
        }
      }
    ]
  })
}

# =============================================================================
# SNS to SQS Subscriptions - Fan out to processing queues
# =============================================================================

# Order Processed → Email Queue (for order confirmation emails)
resource "aws_sns_topic_subscription" "order_to_email" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.order_processed[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.email_queue[0].arn

  # Filter to only email-eligible events
  filter_policy = jsonencode({
    eventType = ["ORDER_PAID", "ORDER_REFUNDED"]
  })

  raw_message_delivery = true
}

# Order Processed → Klaviyo Queue (for Klaviyo sync)
resource "aws_sns_topic_subscription" "order_to_klaviyo" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.order_processed[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.klaviyo_queue[0].arn

  raw_message_delivery = true
}

# Customer Updated → Email Queue (for welcome emails)
resource "aws_sns_topic_subscription" "customer_to_email" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.customer_updated[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.email_queue[0].arn

  filter_policy = jsonencode({
    eventType = ["CUSTOMER_CREATED"]
  })

  raw_message_delivery = true
}

# Customer Updated → Klaviyo Queue
resource "aws_sns_topic_subscription" "customer_to_klaviyo" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.customer_updated[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.klaviyo_queue[0].arn

  raw_message_delivery = true
}

# Tier Changed → Email Queue (for tier upgrade emails)
resource "aws_sns_topic_subscription" "tier_to_email" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.tier_changed[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.email_queue[0].arn

  raw_message_delivery = true
}

# Tier Changed → Klaviyo Queue
resource "aws_sns_topic_subscription" "tier_to_klaviyo" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.tier_changed[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.klaviyo_queue[0].arn

  raw_message_delivery = true
}

# Points Earned → Email Queue (for points earned emails)
resource "aws_sns_topic_subscription" "points_to_email" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.points_earned[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.email_queue[0].arn

  raw_message_delivery = true
}

# Points Earned → Klaviyo Queue
resource "aws_sns_topic_subscription" "points_to_klaviyo" {
  count = var.enable_sqs ? 1 : 0

  topic_arn = aws_sns_topic.points_earned[0].arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.klaviyo_queue[0].arn

  raw_message_delivery = true
}

# =============================================================================
# SQS Queue Policies - Allow SNS to send messages
# =============================================================================

resource "aws_sqs_queue_policy" "email_queue_policy" {
  count = var.enable_sqs ? 1 : 0

  queue_url = aws_sqs_queue.email_queue[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSNSPublish"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.email_queue[0].arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:sns:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${local.name_prefix}-*"
          }
        }
      },
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.email_queue[0].arn
      }
    ]
  })
}

resource "aws_sqs_queue_policy" "klaviyo_queue_policy" {
  count = var.enable_sqs ? 1 : 0

  queue_url = aws_sqs_queue.klaviyo_queue[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSNSPublish"
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.klaviyo_queue[0].arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:sns:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${local.name_prefix}-*"
          }
        }
      },
      {
        Sid    = "AllowLambdaAccess"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.klaviyo_queue[0].arn
      }
    ]
  })
}

# =============================================================================
# Outputs
# =============================================================================

output "sns_webhook_alerts_arn" {
  description = "ARN of the webhook alerts SNS topic"
  value       = aws_sns_topic.webhook_alerts.arn
}

output "sns_webhook_alerts_name" {
  description = "Name of the webhook alerts SNS topic"
  value       = aws_sns_topic.webhook_alerts.name
}

output "sns_order_processed_arn" {
  description = "ARN of the order processed SNS topic"
  value       = var.enable_sqs ? aws_sns_topic.order_processed[0].arn : null
}

output "sns_customer_updated_arn" {
  description = "ARN of the customer updated SNS topic"
  value       = var.enable_sqs ? aws_sns_topic.customer_updated[0].arn : null
}

output "sns_tier_changed_arn" {
  description = "ARN of the tier changed SNS topic"
  value       = var.enable_sqs ? aws_sns_topic.tier_changed[0].arn : null
}

output "sns_points_earned_arn" {
  description = "ARN of the points earned SNS topic"
  value       = var.enable_sqs ? aws_sns_topic.points_earned[0].arn : null
}
