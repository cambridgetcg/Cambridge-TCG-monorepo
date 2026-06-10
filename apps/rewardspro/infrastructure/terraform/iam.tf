# IAM Roles and Policies

# Lambda Execution Role
resource "aws_iam_role" "lambda_execution_role" {
  name = "${local.name_prefix}-lambda-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# Basic Lambda execution policy (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# SQS access policy for Lambda
resource "aws_iam_policy" "lambda_sqs_policy" {
  count = var.enable_sqs ? 1 : 0

  name        = "${local.name_prefix}-lambda-sqs"
  description = "Allow Lambda to access SQS queues"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SQSQueueAccess"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility",
          "sqs:SendMessage"
        ]
        Resource = [
          aws_sqs_queue.order_queue[0].arn,
          aws_sqs_queue.order_queue_dlq[0].arn,
          aws_sqs_queue.email_queue[0].arn,
          aws_sqs_queue.email_queue_dlq[0].arn,
          aws_sqs_queue.klaviyo_queue[0].arn,
          aws_sqs_queue.klaviyo_queue_dlq[0].arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_sqs" {
  count = var.enable_sqs ? 1 : 0

  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_sqs_policy[0].arn
}

# DynamoDB access policy for Lambda
resource "aws_iam_policy" "lambda_dynamodb_policy" {
  count = var.enable_dynamodb_locks ? 1 : 0

  name        = "${local.name_prefix}-lambda-dynamodb"
  description = "Allow Lambda to access DynamoDB tables (locks and rate limits)"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "DynamoDBLocksAccess"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.cron_locks[0].arn,
          aws_dynamodb_table.rate_limits[0].arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_dynamodb" {
  count = var.enable_dynamodb_locks ? 1 : 0

  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_dynamodb_policy[0].arn
}

# Aurora Data API access policy for Lambda
resource "aws_iam_policy" "lambda_aurora_policy" {
  name        = "${local.name_prefix}-lambda-aurora"
  description = "Allow Lambda to access Aurora Data API"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AuroraDataAPIAccess"
        Effect = "Allow"
        Action = [
          "rds-data:ExecuteStatement",
          "rds-data:BatchExecuteStatement",
          "rds-data:BeginTransaction",
          "rds-data:CommitTransaction",
          "rds-data:RollbackTransaction"
        ]
        Resource = [var.aurora_resource_arn]
      },
      {
        Sid    = "SecretsManagerAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [var.aurora_secret_arn]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_aurora" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_aurora_policy.arn
}

# S3 access policy for Lambda
resource "aws_iam_policy" "lambda_s3_policy" {
  count = var.enable_s3_exports ? 1 : 0

  name        = "${local.name_prefix}-lambda-s3"
  description = "Allow Lambda to access S3 exports bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "S3ExportsBucketAccess"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.exports[0].arn,
          "${aws_s3_bucket.exports[0].arn}/*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_s3" {
  count = var.enable_s3_exports ? 1 : 0

  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_s3_policy[0].arn
}

# SNS publish policy for Lambda (for alerting)
resource "aws_iam_policy" "lambda_sns_policy" {
  name        = "${local.name_prefix}-lambda-sns"
  description = "Allow Lambda to publish to SNS topics"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "SNSPublishAccess"
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = [
          "arn:aws:sns:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:${local.name_prefix}-*"
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_sns" {
  role       = aws_iam_role.lambda_execution_role.name
  policy_arn = aws_iam_policy.lambda_sns_policy.arn
}

# Vercel Service Role (for direct AWS access from Vercel)
resource "aws_iam_user" "vercel_service" {
  name = "${local.name_prefix}-vercel-service"
  path = "/service-accounts/"

  tags = local.common_tags
}

resource "aws_iam_access_key" "vercel_service" {
  user = aws_iam_user.vercel_service.name
}

# Policy for Vercel to access AWS services
resource "aws_iam_policy" "vercel_access_policy" {
  name        = "${local.name_prefix}-vercel-access"
  description = "Allow Vercel app to access AWS services"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      # SQS access
      var.enable_sqs ? [
        {
          Sid    = "SQSAccess"
          Effect = "Allow"
          Action = [
            "sqs:SendMessage",
            "sqs:ReceiveMessage",
            "sqs:DeleteMessage",
            "sqs:GetQueueAttributes",
            "sqs:ChangeMessageVisibility"
          ]
          Resource = [
            aws_sqs_queue.order_queue[0].arn,
            aws_sqs_queue.order_queue_dlq[0].arn,
            aws_sqs_queue.email_queue[0].arn,
            aws_sqs_queue.email_queue_dlq[0].arn,
            aws_sqs_queue.klaviyo_queue[0].arn,
            aws_sqs_queue.klaviyo_queue_dlq[0].arn
          ]
        },
        {
          Sid    = "SNSPublishAccess"
          Effect = "Allow"
          Action = [
            "sns:Publish"
          ]
          Resource = [
            aws_sns_topic.order_processed[0].arn,
            aws_sns_topic.customer_updated[0].arn,
            aws_sns_topic.tier_changed[0].arn,
            aws_sns_topic.points_earned[0].arn
          ]
        }
      ] : [],
      # DynamoDB access
      var.enable_dynamodb_locks ? [
        {
          Sid    = "DynamoDBAccess"
          Effect = "Allow"
          Action = [
            "dynamodb:GetItem",
            "dynamodb:PutItem",
            "dynamodb:DeleteItem",
            "dynamodb:UpdateItem"
          ]
          Resource = [
            aws_dynamodb_table.cron_locks[0].arn,
            aws_dynamodb_table.rate_limits[0].arn
          ]
        }
      ] : [],
      # S3 access
      var.enable_s3_exports ? [
        {
          Sid    = "S3Access"
          Effect = "Allow"
          Action = [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject",
            "s3:ListBucket"
          ]
          Resource = [
            aws_s3_bucket.exports[0].arn,
            "${aws_s3_bucket.exports[0].arn}/*"
          ]
        }
      ] : [],
      # Aurora Data API (always enabled)
      [
        {
          Sid    = "AuroraAccess"
          Effect = "Allow"
          Action = [
            "rds-data:ExecuteStatement",
            "rds-data:BatchExecuteStatement",
            "rds-data:BeginTransaction",
            "rds-data:CommitTransaction",
            "rds-data:RollbackTransaction"
          ]
          Resource = [var.aurora_resource_arn]
        },
        {
          Sid    = "SecretsAccess"
          Effect = "Allow"
          Action = [
            "secretsmanager:GetSecretValue"
          ]
          Resource = [var.aurora_secret_arn]
        }
      ]
    )
  })
}

resource "aws_iam_user_policy_attachment" "vercel_access" {
  user       = aws_iam_user.vercel_service.name
  policy_arn = aws_iam_policy.vercel_access_policy.arn
}
