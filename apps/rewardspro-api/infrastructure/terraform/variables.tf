variable "aws_region" {
  description = "AWS region in which to create the stack."
  type        = string
  default     = "eu-west-2"

  validation {
    condition     = can(regex("^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "aws_region must be a valid AWS region name."
  }
}

variable "project_name" {
  description = "Short lowercase name used as the resource-name prefix."
  type        = string
  default     = "rewardspro-api"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.project_name))
    error_message = "project_name must be 3-20 lowercase alphanumeric or hyphen characters and begin with a letter."
  }
}

variable "environment" {
  description = "Deployment environment. Values prod and production activate production guardrails."
  type        = string
  default     = "dev"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,11}$", var.environment))
    error_message = "environment must be 2-12 lowercase alphanumeric or hyphen characters and begin with a letter."
  }
}

variable "tags" {
  description = "Additional tags merged with the stack's required default tags."
  type        = map(string)
  default     = {}

  validation {
    condition = alltrue([
      for key in keys(var.tags) : !contains([
        "application",
        "environment",
        "managedby",
        "project",
        "sourcecommit",
        "sourcetemplatearn",
        "taskdefinitionrole",
      ], lower(key))
    ])
    error_message = "tags must not override stack or release ownership tags."
  }
}

variable "availability_zones" {
  description = "Exactly two AZs. Leave empty to use the first two available AZs in aws_region."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.availability_zones) == 0 || length(var.availability_zones) == 2
    error_message = "availability_zones must be empty or contain exactly two AZs."
  }
}

variable "vpc_cidr" {
  description = "IPv4 CIDR for the VPC."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid IPv4 CIDR."
  }
}

variable "public_subnet_cidrs" {
  description = "Two public subnet CIDRs, one per AZ, used only by the ALB and NAT gateways."
  type        = list(string)
  default     = ["10.40.0.0/24", "10.40.1.0/24"]

  validation {
    condition     = length(var.public_subnet_cidrs) == 2 && alltrue([for cidr in var.public_subnet_cidrs : can(cidrnetmask(cidr))])
    error_message = "public_subnet_cidrs must contain exactly two valid IPv4 CIDRs."
  }
}

variable "private_app_subnet_cidrs" {
  description = "Two private application subnet CIDRs, one per AZ."
  type        = list(string)
  default     = ["10.40.10.0/24", "10.40.11.0/24"]

  validation {
    condition     = length(var.private_app_subnet_cidrs) == 2 && alltrue([for cidr in var.private_app_subnet_cidrs : can(cidrnetmask(cidr))])
    error_message = "private_app_subnet_cidrs must contain exactly two valid IPv4 CIDRs."
  }
}

variable "private_db_subnet_cidrs" {
  description = "Two isolated database subnet CIDRs, one per AZ."
  type        = list(string)
  default     = ["10.40.20.0/24", "10.40.21.0/24"]

  validation {
    condition     = length(var.private_db_subnet_cidrs) == 2 && alltrue([for cidr in var.private_db_subnet_cidrs : can(cidrnetmask(cidr))])
    error_message = "private_db_subnet_cidrs must contain exactly two valid IPv4 CIDRs."
  }
}

variable "nat_gateway_count" {
  description = "Number of NAT gateways. Non-production may use one; production requires two."
  type        = number
  default     = 1

  validation {
    condition     = contains([1, 2], var.nat_gateway_count)
    error_message = "nat_gateway_count must be either 1 or 2."
  }
}

variable "enable_vpc_flow_logs" {
  description = "Write rejected and accepted VPC flow metadata to CloudWatch Logs."
  type        = bool
  default     = true
}

variable "certificate_arn" {
  description = "ACM certificate ARN for the public HTTPS listener. Required in production."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.certificate_arn == null || can(regex("^arn:[^:]+:acm:[^:]+:[0-9]{12}:certificate/.+$", var.certificate_arn))
    error_message = "certificate_arn must be null or a valid ACM certificate ARN."
  }
}

variable "public_hostname" {
  description = "DNS hostname whose alias record points to the ALB. Required with certificate_arn and in production; Terraform does not manage DNS."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition = (
      var.public_hostname == null ||
      try(
        length(var.public_hostname) <= 253 &&
        can(regex("^([A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$", var.public_hostname)),
        false,
      )
    )
    error_message = "public_hostname must be null or a DNS hostname without a URL scheme or path."
  }
}

variable "container_port" {
  description = "Port exposed by the API container."
  type        = number
  default     = 3000

  validation {
    condition     = var.container_port == 3000
    error_message = "The RewardsPro API runtime contract currently requires container_port 3000."
  }
}

variable "health_check_path" {
  description = "Unauthenticated liveness path used by the ALB."
  type        = string
  default     = "/health/live"

  validation {
    condition     = var.health_check_path == "/health/live"
    error_message = "The RewardsPro API runtime contract currently requires health_check_path /health/live."
  }
}

variable "bootstrap_image_tag" {
  description = "Initial ECR tag referenced by Terraform-owned base task definitions. CI owns later immutable revisions."
  type        = string
  default     = "bootstrap"

  validation {
    condition     = can(regex("^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$", var.bootstrap_image_tag))
    error_message = "bootstrap_image_tag must be a valid ECR image tag."
  }
}

variable "bootstrap_mode" {
  description = "One-shot first-apply mode that creates ECS services and autoscaling minima at zero. It does not drain an already active service."
  type        = bool
  default     = true
}

variable "log_level" {
  description = "Application log level."
  type        = string
  default     = "info"

  validation {
    condition     = contains(["fatal", "error", "warn", "info", "debug", "trace", "silent"], var.log_level)
    error_message = "log_level must be a Pino-supported level."
  }
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days."
  type        = number
  default     = 30

  validation {
    condition     = contains([7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a retention value supported by CloudWatch Logs."
  }
}

variable "api_cpu" {
  description = "Fargate CPU units for each API task."
  type        = number
  default     = 512
}

variable "api_memory" {
  description = "Fargate memory in MiB for each API task."
  type        = number
  default     = 1024
}

variable "worker_cpu" {
  description = "Fargate CPU units for each worker task."
  type        = number
  default     = 512
}

variable "worker_memory" {
  description = "Fargate memory in MiB for each worker task."
  type        = number
  default     = 1024
}

variable "migration_cpu" {
  description = "Fargate CPU units for one-off migration tasks."
  type        = number
  default     = 512
}

variable "migration_memory" {
  description = "Fargate memory in MiB for one-off migration tasks."
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Baseline API task count used on initial non-bootstrap creation."
  type        = number
  default     = 2

  validation {
    condition     = var.api_desired_count >= 1
    error_message = "api_desired_count must be at least 1; bootstrap_mode controls zero-capacity bootstrap."
  }
}

variable "api_min_capacity" {
  description = "Minimum active API task count."
  type        = number
  default     = 2

  validation {
    condition     = var.api_min_capacity >= 1
    error_message = "api_min_capacity must be at least 1; bootstrap_mode controls zero-capacity bootstrap."
  }
}

variable "api_max_capacity" {
  description = "Maximum autoscaled API task count."
  type        = number
  default     = 8

  validation {
    condition     = var.api_max_capacity >= 2
    error_message = "api_max_capacity must be at least 2."
  }
}

variable "worker_desired_count" {
  description = "Baseline worker task count used on initial non-bootstrap creation."
  type        = number
  default     = 1

  validation {
    condition     = var.worker_desired_count >= 1
    error_message = "worker_desired_count must be at least 1; bootstrap_mode controls zero-capacity bootstrap."
  }
}

variable "worker_min_capacity" {
  description = "Minimum active worker task count."
  type        = number
  default     = 1

  validation {
    condition     = var.worker_min_capacity >= 1
    error_message = "worker_min_capacity must be at least 1; bootstrap_mode controls zero-capacity bootstrap."
  }
}

variable "worker_max_capacity" {
  description = "Maximum autoscaled worker task count."
  type        = number
  default     = 8

  validation {
    condition     = var.worker_max_capacity >= 1
    error_message = "worker_max_capacity must be at least 1."
  }
}

variable "api_cpu_target" {
  description = "Target average API CPU utilization percentage."
  type        = number
  default     = 60

  validation {
    condition     = var.api_cpu_target > 0 && var.api_cpu_target < 100
    error_message = "api_cpu_target must be between 0 and 100."
  }
}

variable "api_memory_target" {
  description = "Target average API memory utilization percentage."
  type        = number
  default     = 70

  validation {
    condition     = var.api_memory_target > 0 && var.api_memory_target < 100
    error_message = "api_memory_target must be between 0 and 100."
  }
}

variable "worker_queue_depth_target" {
  description = "Visible SQS messages at which worker target tracking adds capacity."
  type        = number
  default     = 20

  validation {
    condition     = var.worker_queue_depth_target > 0
    error_message = "worker_queue_depth_target must be positive."
  }
}

variable "db_name" {
  description = "Initial PostgreSQL database name."
  type        = string
  default     = "rewardspro"

  validation {
    condition     = can(regex("^[a-z][a-z0-9_]{0,62}$", var.db_name))
    error_message = "db_name must be a valid unquoted PostgreSQL database identifier."
  }
}

variable "db_master_username" {
  description = "RDS-managed administrative username. Its generated password is never passed to runtime tasks."
  type        = string
  default     = "rewardspro_admin"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]{0,62}$", var.db_master_username))
    error_message = "db_master_username must be a valid PostgreSQL role name."
  }
}

variable "db_engine_version" {
  description = "PostgreSQL 16 engine version. A major-only value lets RDS choose the current supported minor."
  type        = string
  default     = "16"

  validation {
    condition     = can(regex("^16(\\.[0-9]+)?$", var.db_engine_version))
    error_message = "db_engine_version must select PostgreSQL major version 16."
  }
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.medium"

  validation {
    condition     = startswith(var.db_instance_class, "db.")
    error_message = "db_instance_class must begin with db.."
  }
}

variable "db_allocated_storage_gib" {
  description = "Initial gp3 storage allocation in GiB."
  type        = number
  default     = 20

  validation {
    condition     = var.db_allocated_storage_gib >= 20
    error_message = "db_allocated_storage_gib must be at least 20 GiB for gp3."
  }
}

variable "db_max_allocated_storage_gib" {
  description = "Maximum RDS storage autoscaling allocation in GiB."
  type        = number
  default     = 100

  validation {
    condition     = var.db_max_allocated_storage_gib >= 20
    error_message = "db_max_allocated_storage_gib must be at least 20 GiB."
  }
}

variable "db_backup_retention_days" {
  description = "RDS point-in-time recovery window."
  type        = number
  default     = 14

  validation {
    condition     = var.db_backup_retention_days >= 1 && var.db_backup_retention_days <= 35
    error_message = "db_backup_retention_days must be between 1 and 35."
  }
}

variable "sqs_visibility_timeout_seconds" {
  description = "Worker queue visibility timeout."
  type        = number
  default     = 300

  validation {
    condition     = var.sqs_visibility_timeout_seconds >= 30 && var.sqs_visibility_timeout_seconds <= 43200
    error_message = "sqs_visibility_timeout_seconds must be between 30 and 43200."
  }
}

variable "migration_query_timeout_ms" {
  description = "Per-file PostgreSQL migration query timeout. The 9-minute default remains below the ECS tasks-stopped waiter horizon."
  type        = number
  default     = 540000

  validation {
    condition     = var.migration_query_timeout_ms >= 10000 && var.migration_query_timeout_ms <= 540000
    error_message = "migration_query_timeout_ms must be between 10000 and 540000."
  }
}

variable "schedules" {
  description = "EventBridge Scheduler messages delivered to the worker queue."
  type = map(object({
    schedule_expression          = string
    schedule_expression_timezone = optional(string, "UTC")
    payload                      = string
    enabled                      = optional(bool, true)
  }))
  default = {}

  validation {
    condition = alltrue([
      for name, schedule in var.schedules : try(
        jsondecode(schedule.payload).type == "command" &&
        jsondecode(schedule.payload).schemaVersion == 1 &&
        jsondecode(schedule.payload).command == "flush_outbox" &&
        length(keys(jsondecode(schedule.payload))) == 3,
        false,
      )
    ])
    error_message = "Every schedule payload must be exactly the flush_outbox command envelope: type=command, schemaVersion=1, command=flush_outbox, with no additional keys."
  }

  validation {
    condition     = alltrue([for name, schedule in var.schedules : can(regex("^[0-9A-Za-z_.-]{1,64}$", name))])
    error_message = "Every schedule key must be a valid EventBridge Scheduler name."
  }
}

variable "alarm_action_arns" {
  description = "Optional SNS topic ARNs notified by CloudWatch alarms."
  type        = list(string)
  default     = []
}

variable "create_github_oidc_provider" {
  description = "Create the account-global GitHub Actions OIDC provider. Leave false when one already exists."
  type        = bool
  default     = false
}

variable "github_oidc_provider_arn" {
  description = "Existing token.actions.githubusercontent.com IAM OIDC provider ARN. Mutually exclusive with create_github_oidc_provider."
  type        = string
  default     = null
  nullable    = true
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the deployment role, in owner/repository form."
  type        = string
  default     = "cambridgetcg/Cambridge-TCG-monorepo"

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must use owner/repository format."
  }
}

variable "github_repository_id" {
  description = "Immutable GitHub repository ID allowed to assume the deployment role."
  type        = string
  default     = "1223740492"

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_id))
    error_message = "github_repository_id must be a positive decimal GitHub repository ID."
  }
}

variable "github_repository_owner_id" {
  description = "Immutable GitHub repository-owner ID allowed to assume the deployment role."
  type        = string
  default     = "168088678"

  validation {
    condition     = can(regex("^[1-9][0-9]*$", var.github_repository_owner_id))
    error_message = "github_repository_owner_id must be a positive decimal GitHub owner ID."
  }
}

variable "github_environment" {
  description = "GitHub Environment encoded into the OIDC subject. Must exactly match the workflow environment."
  type        = string
  default     = "rewardspro-v2-production"
  nullable    = true

  validation {
    condition     = var.github_environment == null || length(trimspace(var.github_environment)) > 0
    error_message = "github_environment must be null or a non-empty GitHub Environment name."
  }
}
