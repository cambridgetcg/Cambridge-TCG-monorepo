resource "aws_scheduler_schedule_group" "worker" {
  name = "${local.name}-worker"
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceArn"
      values   = [aws_scheduler_schedule_group.worker.arn]
    }
  }
}

resource "aws_iam_role" "scheduler" {
  name               = "${local.name}-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "scheduler" {
  statement {
    sid     = "SendScheduledMessages"
    effect  = "Allow"
    actions = ["sqs:SendMessage"]
    resources = [
      aws_sqs_queue.worker.arn,
      aws_sqs_queue.worker_dlq.arn,
    ]
  }
}

resource "aws_iam_role_policy" "scheduler" {
  name   = "send-worker-messages"
  policy = data.aws_iam_policy_document.scheduler.json
  role   = aws_iam_role.scheduler.id
}

resource "aws_scheduler_schedule" "worker" {
  for_each = var.schedules

  group_name                   = aws_scheduler_schedule_group.worker.name
  name                         = each.key
  schedule_expression          = each.value.schedule_expression
  schedule_expression_timezone = each.value.schedule_expression_timezone
  state                        = each.value.enabled ? "ENABLED" : "DISABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_sqs_queue.worker.arn
    input    = each.value.payload
    role_arn = aws_iam_role.scheduler.arn

    dead_letter_config {
      arn = aws_sqs_queue.worker_dlq.arn
    }
  }
}
