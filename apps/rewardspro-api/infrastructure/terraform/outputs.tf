output "aws_region" {
  description = "AWS region containing the stack."
  value       = var.aws_region
}

output "vpc_id" {
  description = "RewardsPro VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs used by the ALB and NAT gateways."
  value       = [for availability_zone in local.availability_zones : aws_subnet.public[availability_zone].id]
}

output "private_app_subnet_ids" {
  description = "Private subnet IDs used by API, worker, and migration tasks."
  value       = [for availability_zone in local.availability_zones : aws_subnet.private_app[availability_zone].id]
}

output "private_db_subnet_ids" {
  description = "Isolated subnet IDs used by RDS."
  value       = [for availability_zone in local.availability_zones : aws_subnet.private_db[availability_zone].id]
}

output "alb_arn" {
  description = "Public application load balancer ARN."
  value       = aws_lb.api.arn
}

output "alb_dns_name" {
  description = "AWS-generated ALB hostname. Create a DNS alias to this value; do not use it as an HTTPS origin."
  value       = aws_lb.api.dns_name
}

output "alb_zone_id" {
  description = "Canonical hosted zone ID used when creating a Route 53 alias record."
  value       = aws_lb.api.zone_id
}

output "api_base_url" {
  description = "Configured public API base URL. Production is always the HTTPS public_hostname, never the raw ALB hostname."
  value       = local.api_base_url
}

output "ecr_repository_name" {
  description = "ECR repository name."
  value       = aws_ecr_repository.api.name
}

output "ecr_repository_url" {
  description = "ECR repository URL used by the deployment workflow."
  value       = aws_ecr_repository.api.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repository ARN."
  value       = aws_ecr_repository.api.arn
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.this.arn
}

output "ecs_security_group_id" {
  description = "Security group for API, worker, and migration Fargate ENIs."
  value       = aws_security_group.ecs.id
}

output "api_service_name" {
  description = "API ECS service name."
  value       = aws_ecs_service.api.name
}

output "api_service_arn" {
  description = "API ECS service ARN."
  value       = aws_ecs_service.api.id
}

output "worker_service_name" {
  description = "Worker ECS service name."
  value       = aws_ecs_service.worker.name
}

output "worker_service_arn" {
  description = "Worker ECS service ARN."
  value       = aws_ecs_service.worker.id
}

output "api_task_definition_template_family" {
  description = "Terraform-owned API template family read by CI."
  value       = aws_ecs_task_definition.api.family
}

output "api_task_definition_template_arn" {
  description = "Latest Terraform-owned API template revision at apply time."
  value       = aws_ecs_task_definition.api.arn
}

output "api_task_definition_family" {
  description = "CI-owned immutable API release family."
  value       = "${local.name}-api"
}

output "worker_task_definition_template_family" {
  description = "Terraform-owned worker template family read by CI."
  value       = aws_ecs_task_definition.worker.family
}

output "worker_task_definition_template_arn" {
  description = "Latest Terraform-owned worker template revision at apply time."
  value       = aws_ecs_task_definition.worker.arn
}

output "worker_task_definition_family" {
  description = "CI-owned immutable worker release family."
  value       = "${local.name}-worker"
}

output "migration_task_definition_template_family" {
  description = "Terraform-owned migration template family read by CI."
  value       = aws_ecs_task_definition.migration.family
}

output "migration_task_definition_template_arn" {
  description = "Latest Terraform-owned migration template revision at apply time."
  value       = aws_ecs_task_definition.migration.arn
}

output "migration_task_definition_family" {
  description = "CI-owned immutable one-off migration release family."
  value       = "${local.name}-migration"
}

output "container_names" {
  description = "Stable container names used by CI when replacing image digests."
  value = {
    api       = "api"
    worker    = "worker"
    migration = "migration"
  }
}

output "worker_queue_url" {
  description = "SQS worker queue URL."
  value       = aws_sqs_queue.worker.url
}

output "worker_queue_arn" {
  description = "SQS worker queue ARN."
  value       = aws_sqs_queue.worker.arn
}

output "worker_dlq_arn" {
  description = "Worker dead-letter queue ARN."
  value       = aws_sqs_queue.worker_dlq.arn
}

output "scheduler_group_name" {
  description = "EventBridge Scheduler group name."
  value       = aws_scheduler_schedule_group.worker.name
}

output "database_address" {
  description = "Private RDS hostname."
  value       = aws_db_instance.database.address
}

output "database_port" {
  description = "PostgreSQL port."
  value       = aws_db_instance.database.port
}

output "database_name" {
  description = "Initial PostgreSQL database name."
  value       = aws_db_instance.database.db_name
}

output "rds_master_secret_arn" {
  description = "RDS-managed administrative secret ARN. Only the migration task role may read it."
  value       = aws_db_instance.database.master_user_secret[0].secret_arn
}

output "api_database_secret_arn" {
  description = "Empty least-privilege API database secret placeholder ARN."
  value       = aws_secretsmanager_secret.api_database.arn
}

output "worker_database_secret_arn" {
  description = "Empty least-privilege worker database secret placeholder ARN."
  value       = aws_secretsmanager_secret.worker_database.arn
}

output "shopify_api_secret_arn" {
  description = "Empty Shopify API secret placeholder ARN."
  value       = aws_secretsmanager_secret.shopify_api.arn
}

output "operator_token_secret_arn" {
  description = "Empty operator token secret placeholder ARN."
  value       = aws_secretsmanager_secret.operator_token.arn
}

output "github_oidc_provider_arn" {
  description = "Effective existing or newly created GitHub Actions OIDC provider ARN."
  value       = local.github_oidc_provider_arn
}

output "github_deploy_role_arn" {
  description = "Least-privilege role assumed by the GitHub deployment environment."
  value       = aws_iam_role.github_deploy.arn
}

output "bootstrap_mode" {
  description = "Whether this configuration is in one-shot initial bootstrap mode; this output is not a drain-state signal."
  value       = var.bootstrap_mode
}
