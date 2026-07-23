resource "aws_sqs_queue" "worker_dlq" {
  name = "${local.name}-worker-dlq"

  message_retention_seconds  = 1209600
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds
}

resource "aws_sqs_queue" "worker" {
  name = "${local.name}-worker"

  message_retention_seconds  = 345600
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  visibility_timeout_seconds = var.sqs_visibility_timeout_seconds

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.worker_dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "worker_dlq" {
  queue_url = aws_sqs_queue.worker_dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.worker.arn]
  })
}

data "aws_iam_policy_document" "worker_queue" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    actions = ["sqs:*"]
    resources = [
      aws_sqs_queue.worker.arn,
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "worker" {
  queue_url = aws_sqs_queue.worker.id
  policy    = data.aws_iam_policy_document.worker_queue.json
}

data "aws_iam_policy_document" "worker_dlq" {
  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    actions = ["sqs:*"]
    resources = [
      aws_sqs_queue.worker_dlq.arn,
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_sqs_queue_policy" "worker_dlq" {
  queue_url = aws_sqs_queue.worker_dlq.id
  policy    = data.aws_iam_policy_document.worker_dlq.json
}
