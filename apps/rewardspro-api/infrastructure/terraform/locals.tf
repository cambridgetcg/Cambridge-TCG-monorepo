locals {
  name          = "${var.project_name}-${var.environment}"
  is_production = contains(["prod", "production"], lower(var.environment))

  availability_zones = length(var.availability_zones) == 2 ? var.availability_zones : slice(
    data.aws_availability_zones.available.names,
    0,
    2,
  )

  public_subnets = {
    for index, availability_zone in local.availability_zones :
    availability_zone => {
      cidr  = var.public_subnet_cidrs[index]
      index = index
    }
  }

  private_app_subnets = {
    for index, availability_zone in local.availability_zones :
    availability_zone => {
      cidr  = var.private_app_subnet_cidrs[index]
      index = index
    }
  }

  private_db_subnets = {
    for index, availability_zone in local.availability_zones :
    availability_zone => {
      cidr  = var.private_db_subnet_cidrs[index]
      index = index
    }
  }

  github_environment       = coalesce(var.github_environment, var.environment)
  github_oidc_provider_arn = var.create_github_oidc_provider ? one(aws_iam_openid_connect_provider.github[*].arn) : var.github_oidc_provider_arn

  api_secret_arns = [
    aws_secretsmanager_secret.api_database.arn,
    aws_secretsmanager_secret.shopify_api.arn,
    aws_secretsmanager_secret.operator_token.arn,
  ]

  common_service_environment = [
    {
      name  = "NODE_ENV"
      value = "production"
    },
    {
      name  = "LOG_LEVEL"
      value = var.log_level
    },
    {
      name  = "AWS_REGION"
      value = var.aws_region
    },
    {
      name  = "DB_SSL_ROOT_CERT"
      value = "/app/certs/eu-west-2-bundle.pem"
    },
  ]

  api_environment = concat(local.common_service_environment, [
    {
      name  = "DB_SECRET_ARN"
      value = aws_secretsmanager_secret.api_database.arn
    },
    {
      name  = "PORT"
      value = tostring(var.container_port)
    },
    {
      name  = "SHOPIFY_API_SECRET_ARN"
      value = aws_secretsmanager_secret.shopify_api.arn
    },
    {
      name  = "OPERATOR_TOKEN_SECRET_ARN"
      value = aws_secretsmanager_secret.operator_token.arn
    },
    {
      name  = "SQS_QUEUE_URL"
      value = aws_sqs_queue.worker.url
    },
  ])

  worker_environment = concat(local.common_service_environment, [
    {
      name  = "DB_SECRET_ARN"
      value = aws_secretsmanager_secret.worker_database.arn
    },
    {
      name  = "SQS_QUEUE_URL"
      value = aws_sqs_queue.worker.url
    },
    {
      name  = "WORKER_VISIBILITY_TIMEOUT_SECONDS"
      value = tostring(var.sqs_visibility_timeout_seconds)
    },
  ])

  api_base_url = var.public_hostname == null ? (
    var.certificate_arn == null ? "http://${aws_lb.api.dns_name}" : null
    ) : format(
    "%s://%s",
    var.certificate_arn == null ? "http" : "https",
    var.public_hostname,
  )
}

resource "terraform_data" "guardrails" {
  input = {
    environment = var.environment
  }

  lifecycle {
    precondition {
      condition     = length(local.name) <= 28
      error_message = "project_name and environment together must be at most 28 characters so AWS resource names remain valid."
    }

    precondition {
      condition     = !local.is_production || var.nat_gateway_count >= 2
      error_message = "Production requires at least two NAT gateways so each application AZ retains independent egress."
    }

    precondition {
      condition     = !local.is_production || var.certificate_arn != null
      error_message = "Production requires certificate_arn; an HTTP-only public listener is allowed only outside production."
    }

    precondition {
      condition     = var.certificate_arn == null || var.public_hostname != null
      error_message = "A certificate requires public_hostname because ACM certificates cannot cover the AWS-generated ALB hostname."
    }

    precondition {
      condition = (
        var.certificate_arn == null ||
        try(
          split(":", var.certificate_arn)[3] == var.aws_region &&
          split(":", var.certificate_arn)[4] == data.aws_caller_identity.current.account_id,
          false,
        )
      )
      error_message = "certificate_arn must belong to the target AWS account and region."
    }

    precondition {
      condition     = !local.is_production || var.public_hostname != null
      error_message = "Production requires public_hostname for its HTTPS API URL and DNS alias."
    }

    precondition {
      condition = (
        (var.create_github_oidc_provider && var.github_oidc_provider_arn == null) ||
        (!var.create_github_oidc_provider && var.github_oidc_provider_arn != null)
      )
      error_message = "Choose exactly one GitHub OIDC source: set create_github_oidc_provider=true or supply github_oidc_provider_arn."
    }

    precondition {
      condition = (
        var.github_oidc_provider_arn == null ||
        can(regex(
          "^arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token\\.actions\\.githubusercontent\\.com$",
          var.github_oidc_provider_arn,
        ))
      )
      error_message = "github_oidc_provider_arn must be this AWS account's token.actions.githubusercontent.com provider."
    }

    precondition {
      condition     = !local.is_production || local.github_environment == "rewardspro-v2-production"
      error_message = "Production OIDC trust must use the workflow's rewardspro-v2-production GitHub Environment."
    }

    precondition {
      condition     = !local.is_production || var.db_backup_retention_days >= 7
      error_message = "Production requires at least seven days of RDS point-in-time recovery."
    }

    precondition {
      condition = (
        var.bootstrap_mode ||
        !local.is_production ||
        (
          var.api_min_capacity >= 2 &&
          var.api_desired_count >= 2 &&
          var.worker_min_capacity >= 1 &&
          var.worker_desired_count >= 1
        )
      )
      error_message = "Active production requires at least two API tasks and one worker task. Use bootstrap_mode=true only during the first image/secret bootstrap."
    }
  }
}
