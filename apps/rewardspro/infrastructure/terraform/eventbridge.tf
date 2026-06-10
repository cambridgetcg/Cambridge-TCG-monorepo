# EventBridge Rules for Cron Jobs

# EventBridge Rule: Tier Maintenance (Daily at 2 AM UTC)
resource "aws_cloudwatch_event_rule" "tier_maintenance" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-tier-maintenance"
  description         = "Trigger tier maintenance tasks daily"
  schedule_expression = "cron(0 2 * * ? *)"

  tags = merge(local.common_tags, {
    CronJob = "tier-maintenance"
  })
}

resource "aws_cloudwatch_event_target" "tier_maintenance" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.tier_maintenance[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "tier-maintenance"
  })
}

# EventBridge Rule: Tier Recalculation (Weekly Sunday at 3 AM UTC)
resource "aws_cloudwatch_event_rule" "tier_recalculation" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-tier-recalculation"
  description         = "Trigger tier recalculation weekly"
  schedule_expression = "cron(0 3 ? * SUN *)"

  tags = merge(local.common_tags, {
    CronJob = "tier-recalculation"
  })
}

resource "aws_cloudwatch_event_target" "tier_recalculation" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.tier_recalculation[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "tier-recalculation"
  })
}

# EventBridge Rule: Webhook Cleanup (Daily at 4 AM UTC)
resource "aws_cloudwatch_event_rule" "webhook_cleanup" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-webhook-cleanup"
  description         = "Clean up processed webhooks daily"
  schedule_expression = "cron(0 4 * * ? *)"

  tags = merge(local.common_tags, {
    CronJob = "webhook-cleanup"
  })
}

resource "aws_cloudwatch_event_target" "webhook_cleanup" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.webhook_cleanup[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "webhook-cleanup"
  })
}

# EventBridge Rule: Order Sync (Every 15 minutes)
resource "aws_cloudwatch_event_rule" "order_sync" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-order-sync"
  description         = "Sync orders from Shopify every 15 minutes"
  schedule_expression = "rate(15 minutes)"

  tags = merge(local.common_tags, {
    CronJob = "order-sync"
  })
}

resource "aws_cloudwatch_event_target" "order_sync" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.order_sync[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "order-sync"
  })
}

# EventBridge Rule: Cache Warmup (Every hour)
resource "aws_cloudwatch_event_rule" "cache_warmup" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-cache-warmup"
  description         = "Warm up caches every hour"
  schedule_expression = "rate(1 hour)"

  tags = merge(local.common_tags, {
    CronJob = "cache-warmup"
  })
}

resource "aws_cloudwatch_event_target" "cache_warmup" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.cache_warmup[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "cache-warmup"
  })
}

# EventBridge Rule: Analytics Aggregation (Daily at 1 AM UTC)
resource "aws_cloudwatch_event_rule" "analytics_aggregation" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-analytics-aggregation"
  description         = "Aggregate analytics data daily"
  schedule_expression = "cron(0 1 * * ? *)"

  tags = merge(local.common_tags, {
    CronJob = "analytics-aggregation"
  })
}

resource "aws_cloudwatch_event_target" "analytics_aggregation" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.analytics_aggregation[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "analytics-aggregation"
  })
}

# EventBridge Rule: Email Digest (Weekly Monday at 8 AM UTC)
resource "aws_cloudwatch_event_rule" "email_digest" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-email-digest"
  description         = "Send email digests weekly"
  schedule_expression = "cron(0 8 ? * MON *)"

  tags = merge(local.common_tags, {
    CronJob = "email-digest"
  })
}

resource "aws_cloudwatch_event_target" "email_digest" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.email_digest[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "email-digest"
  })
}

# EventBridge Rule: Subscription Renewal (Daily at 6 AM UTC)
resource "aws_cloudwatch_event_rule" "subscription_renewal" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-subscription-renewal"
  description         = "Process subscription renewals daily"
  schedule_expression = "cron(0 6 * * ? *)"

  tags = merge(local.common_tags, {
    CronJob = "subscription-renewal"
  })
}

resource "aws_cloudwatch_event_target" "subscription_renewal" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.subscription_renewal[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "subscription-renewal"
  })
}

# EventBridge Rule: Points Expiration (Monthly on 1st at midnight UTC)
resource "aws_cloudwatch_event_rule" "points_expiration" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-points-expiration"
  description         = "Handle points expiration monthly"
  schedule_expression = "cron(0 0 1 * ? *)"

  tags = merge(local.common_tags, {
    CronJob = "points-expiration"
  })
}

resource "aws_cloudwatch_event_target" "points_expiration" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.points_expiration[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "points-expiration"
  })
}

# EventBridge Rule: Credit Reconciliation (Daily at 5 AM UTC)
resource "aws_cloudwatch_event_rule" "credit_reconciliation" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-credit-reconciliation"
  description         = "Reconcile store credits daily"
  schedule_expression = "cron(0 5 * * ? *)"

  tags = merge(local.common_tags, {
    CronJob = "credit-reconciliation"
  })
}

resource "aws_cloudwatch_event_target" "credit_reconciliation" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.credit_reconciliation[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "credit-reconciliation"
  })
}

# EventBridge Rule: DLQ Processor (Every 30 minutes)
resource "aws_cloudwatch_event_rule" "dlq_processor" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-dlq-processor"
  description         = "Process dead letter queue every 30 minutes"
  schedule_expression = "rate(30 minutes)"

  tags = merge(local.common_tags, {
    CronJob = "dlq-processor"
  })
}

resource "aws_cloudwatch_event_target" "dlq_processor" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.dlq_processor[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "dlq-processor"
  })
}

# EventBridge Rule: Health Check (Every 5 minutes)
resource "aws_cloudwatch_event_rule" "health_check" {
  count = var.enable_eventbridge ? 1 : 0

  name                = "${local.name_prefix}-cron-health-check"
  description         = "Health check every 5 minutes"
  schedule_expression = "rate(5 minutes)"

  tags = merge(local.common_tags, {
    CronJob = "health-check"
  })
}

resource "aws_cloudwatch_event_target" "health_check" {
  count = var.enable_eventbridge ? 1 : 0

  rule      = aws_cloudwatch_event_rule.health_check[0].name
  target_id = "CronDispatcher"
  arn       = aws_lambda_function.cron_dispatcher[0].arn

  input = jsonencode({
    jobName = "health-check"
  })
}

# Lambda permissions for EventBridge to invoke
resource "aws_lambda_permission" "eventbridge_invoke" {
  count = var.enable_eventbridge ? 1 : 0

  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cron_dispatcher[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = "arn:aws:events:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:rule/${local.name_prefix}-cron-*"
}
