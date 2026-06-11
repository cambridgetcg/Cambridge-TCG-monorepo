# DynamoDB Tables Configuration

# Cron Locks Table
resource "aws_dynamodb_table" "cron_locks" {
  count = var.enable_dynamodb_locks ? 1 : 0

  name         = "${local.name_prefix}-cron-locks"
  billing_mode = var.dynamodb_billing_mode

  # Primary key: lockId (job name)
  hash_key = "lockId"

  attribute {
    name = "lockId"
    type = "S"
  }

  # TTL for automatic lock expiry
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-cron-locks"
    Type = "DistributedLocks"
  })
}

# Optional: Provisioned capacity settings
# Uncomment if using PROVISIONED billing mode
# resource "aws_dynamodb_table" "cron_locks_provisioned" {
#   count = var.enable_dynamodb_locks && var.dynamodb_billing_mode == "PROVISIONED" ? 1 : 0
#
#   name         = "${local.name_prefix}-cron-locks"
#   billing_mode = "PROVISIONED"
#   hash_key     = "lockId"
#
#   read_capacity  = 5
#   write_capacity = 5
#
#   attribute {
#     name = "lockId"
#     type = "S"
#   }
#
#   ttl {
#     attribute_name = "expiresAt"
#     enabled        = true
#   }
# }

# =============================================================================
# Rate Limits Table for Lambda API Rate Limiting
# =============================================================================
# Tracks token bucket state for external API rate limiting (SendGrid, Klaviyo)

resource "aws_dynamodb_table" "rate_limits" {
  count = var.enable_dynamodb_locks ? 1 : 0

  name         = "${local.name_prefix}-rate-limits"
  billing_mode = var.dynamodb_billing_mode

  # Primary key: api:shop (e.g., "sendgrid:shop.myshopify.com")
  hash_key = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  # TTL for automatic cleanup of stale rate limit state
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  # Server-side encryption
  server_side_encryption {
    enabled = true
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-rate-limits"
    Type = "RateLimiting"
  })
}

# CloudWatch Alarms for DynamoDB Monitoring
resource "aws_cloudwatch_metric_alarm" "dynamodb_throttle_alarm" {
  count = var.enable_dynamodb_locks ? 1 : 0

  alarm_name          = "${local.name_prefix}-dynamodb-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "DynamoDB throttling detected - may need to increase capacity"

  dimensions = {
    TableName = aws_dynamodb_table.cron_locks[0].name
  }

  tags = local.common_tags
}
