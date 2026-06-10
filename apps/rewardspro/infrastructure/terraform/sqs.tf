# SQS Order Queue Configuration

# Dead Letter Queue (DLQ)
resource "aws_sqs_queue" "order_queue_dlq" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-order-queue-dlq"

  # Retain failed messages for 14 days
  message_retention_seconds = 1209600

  # Enable server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-order-queue-dlq"
    Type = "DLQ"
  })
}

# Main Order Processing Queue
resource "aws_sqs_queue" "order_queue" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-order-queue"

  # Message retention: 14 days
  message_retention_seconds = var.sqs_message_retention_seconds

  # Visibility timeout: 5 minutes (matches Lambda timeout)
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds

  # Enable long polling (reduces costs)
  receive_wait_time_seconds = 20

  # Enable server-side encryption
  sqs_managed_sse_enabled = true

  # Dead Letter Queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.order_queue_dlq[0].arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-order-queue"
    Type = "OrderProcessing"
  })
}

# Allow DLQ to receive from main queue
resource "aws_sqs_queue_redrive_allow_policy" "dlq_allow" {
  count = var.enable_sqs ? 1 : 0

  queue_url = aws_sqs_queue.order_queue_dlq[0].id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.order_queue[0].arn]
  })
}

# Queue policy for Lambda access
resource "aws_sqs_queue_policy" "order_queue_policy" {
  count = var.enable_sqs ? 1 : 0

  queue_url = aws_sqs_queue.order_queue[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
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
        Resource = aws_sqs_queue.order_queue[0].arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:lambda:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:function:${local.name_prefix}-*"
          }
        }
      }
    ]
  })
}

# CloudWatch Alarms for Queue Monitoring
resource "aws_cloudwatch_metric_alarm" "queue_depth_alarm" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-order-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300 # 5 minutes
  statistic           = "Average"
  threshold           = 1000
  alarm_description   = "Order queue depth exceeds 1000 messages"

  dimensions = {
    QueueName = aws_sqs_queue.order_queue[0].name
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "dlq_alarm" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-order-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60 # 1 minute
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Messages in Dead Letter Queue - requires investigation"

  dimensions = {
    QueueName = aws_sqs_queue.order_queue_dlq[0].name
  }

  tags = local.common_tags
}

# =============================================================================
# SQS Email Queue - Async Email Processing
# =============================================================================
# Decouples email sending from webhook processing for reliability

# Email Queue DLQ
resource "aws_sqs_queue" "email_queue_dlq" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-email-queue-dlq"

  # Retain failed emails for 14 days for investigation
  message_retention_seconds = 1209600

  sqs_managed_sse_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-email-queue-dlq"
    Type = "EmailDLQ"
  })
}

# Main Email Processing Queue
resource "aws_sqs_queue" "email_queue" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-email-queue"

  # Message retention: 4 days (emails shouldn't be delayed too long)
  message_retention_seconds = 345600

  # Visibility timeout: 60 seconds (email sending is fast)
  visibility_timeout_seconds = 60

  # Enable long polling
  receive_wait_time_seconds = 20

  sqs_managed_sse_enabled = true

  # DLQ: After 3 failures, move to DLQ
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_queue_dlq[0].arn
    maxReceiveCount     = 3
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-email-queue"
    Type = "EmailProcessing"
  })
}

# Allow Email DLQ to receive from main queue
resource "aws_sqs_queue_redrive_allow_policy" "email_dlq_allow" {
  count = var.enable_sqs ? 1 : 0

  queue_url = aws_sqs_queue.email_queue_dlq[0].id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.email_queue[0].arn]
  })
}

# =============================================================================
# SQS Klaviyo Queue - Async Klaviyo Event Processing
# =============================================================================
# Decouples Klaviyo sync from webhook processing

# Klaviyo Queue DLQ
resource "aws_sqs_queue" "klaviyo_queue_dlq" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-klaviyo-queue-dlq"

  message_retention_seconds = 1209600

  sqs_managed_sse_enabled = true

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-klaviyo-queue-dlq"
    Type = "KlaviyoDLQ"
  })
}

# Main Klaviyo Processing Queue
resource "aws_sqs_queue" "klaviyo_queue" {
  count = var.enable_sqs ? 1 : 0

  name = "${local.name_prefix}-klaviyo-queue"

  # Message retention: 7 days
  message_retention_seconds = 604800

  # Visibility timeout: 120 seconds (API calls may be slow)
  visibility_timeout_seconds = 120

  receive_wait_time_seconds = 20

  sqs_managed_sse_enabled = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.klaviyo_queue_dlq[0].arn
    maxReceiveCount     = 3
  })

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-klaviyo-queue"
    Type = "KlaviyoProcessing"
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "klaviyo_dlq_allow" {
  count = var.enable_sqs ? 1 : 0

  queue_url = aws_sqs_queue.klaviyo_queue_dlq[0].id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.klaviyo_queue[0].arn]
  })
}

# =============================================================================
# CloudWatch Alarms for Email and Klaviyo Queues
# =============================================================================

resource "aws_cloudwatch_metric_alarm" "email_dlq_alarm" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-email-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Failed emails in DLQ - check SendGrid/SES status"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.email_queue_dlq[0].name
  }

  alarm_actions = [aws_sns_topic.webhook_alerts.arn]

  tags = merge(local.common_tags, {
    AlertType = "EmailDLQ"
  })
}

resource "aws_cloudwatch_metric_alarm" "klaviyo_dlq_alarm" {
  count = var.enable_sqs ? 1 : 0

  alarm_name          = "${local.name_prefix}-klaviyo-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Failed Klaviyo events in DLQ - check Klaviyo API status"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.klaviyo_queue_dlq[0].name
  }

  alarm_actions = [aws_sns_topic.webhook_alerts.arn]

  tags = merge(local.common_tags, {
    AlertType = "KlaviyoDLQ"
  })
}
