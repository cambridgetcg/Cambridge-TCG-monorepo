resource "aws_cloudwatch_metric_alarm" "alb_unhealthy_hosts" {
  alarm_name          = "${local.name}-alb-unhealthy-hosts"
  alarm_description   = "One or more API targets are unhealthy behind the ALB."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "alb_target_5xx" {
  alarm_name          = "${local.name}-alb-target-5xx"
  alarm_description   = "API targets returned five or more 5xx responses in five minutes."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns

  dimensions = {
    LoadBalancer = aws_lb.api.arn_suffix
    TargetGroup  = aws_lb_target_group.api.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_dlq" {
  alarm_name          = "${local.name}-worker-dlq"
  alarm_description   = "At least one worker message is in the dead-letter queue."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns

  dimensions = {
    QueueName = aws_sqs_queue.worker_dlq.name
  }
}

resource "aws_cloudwatch_metric_alarm" "worker_oldest_message" {
  alarm_name          = "${local.name}-worker-oldest-message"
  alarm_description   = "The worker queue's oldest visible message has exceeded the initial five-minute processing SLO for two periods."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 300
  treat_missing_data  = "notBreaching"

  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns

  dimensions = {
    QueueName = aws_sqs_queue.worker.name
  }
}

resource "aws_cloudwatch_metric_alarm" "database_free_storage" {
  alarm_name          = "${local.name}-database-free-storage"
  alarm_description   = "RDS free storage is below 2 GiB."
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Minimum"
  threshold           = 2147483648
  treat_missing_data  = "notBreaching"

  alarm_actions = var.alarm_action_arns
  ok_actions    = var.alarm_action_arns

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.database.identifier
  }
}
