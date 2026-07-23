resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${local.name}/api"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${local.name}/worker"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "migration" {
  name              = "/ecs/${local.name}/migration"
  retention_in_days = var.log_retention_days
}

resource "aws_ecs_cluster" "this" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name = aws_ecs_cluster.this.name

  capacity_providers = ["FARGATE"]

  default_capacity_provider_strategy {
    base              = 1
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_ecs_task_definition" "api" {
  # Terraform owns this template family. CI always clones its latest active
  # revision into the separate release family before changing a service.
  family = "${local.name}-api-template"

  cpu                      = tostring(var.api_cpu)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  memory                   = tostring(var.api_memory)
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = aws_iam_role.api_task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  tags = {
    ManagedBy          = "Terraform"
    TaskDefinitionRole = "Template"
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.bootstrap_image_tag}"
      command   = ["node", "dist/main.js"]
      essential = true

      readonlyRootFilesystem = true

      environment = local.api_environment

      portMappings = [
        {
          name          = "http"
          appProtocol   = "http"
          containerPort = var.container_port
          hostPort      = var.container_port
          protocol      = "tcp"
        },
      ]

      healthCheck = {
        command = [
          "CMD-SHELL",
          "node -e \"fetch('http://127.0.0.1:${var.container_port}${var.health_check_path}').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))\"",
        ]
        interval    = 30
        retries     = 3
        startPeriod = 30
        timeout     = 5
      }

      linuxParameters = {
        initProcessEnabled = true
      }

      mountPoints = [
        {
          sourceVolume  = "tmp"
          containerPath = "/tmp"
          readOnly      = false
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "api"
        }
      }
    },
  ])
}

resource "aws_ecs_task_definition" "worker" {
  # This family is an infrastructure-owned release template. The service may
  # point at a CI release family because task_definition drift is ignored.
  family = "${local.name}-worker-template"

  cpu                      = tostring(var.worker_cpu)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  memory                   = tostring(var.worker_memory)
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = aws_iam_role.worker_task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  tags = {
    ManagedBy          = "Terraform"
    TaskDefinitionRole = "Template"
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([
    {
      name      = "worker"
      image     = "${aws_ecr_repository.api.repository_url}:${var.bootstrap_image_tag}"
      command   = ["node", "dist/worker.js"]
      essential = true

      readonlyRootFilesystem = true

      environment = local.worker_environment

      linuxParameters = {
        initProcessEnabled = true
      }

      mountPoints = [
        {
          sourceVolume  = "tmp"
          containerPath = "/tmp"
          readOnly      = false
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.worker.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "worker"
        }
      }
    },
  ])
}

resource "aws_ecs_task_definition" "migration" {
  # CI clones the latest active template into a separate release family before
  # running the one-off task.
  family = "${local.name}-migration-template"

  cpu                      = tostring(var.migration_cpu)
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  memory                   = tostring(var.migration_memory)
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  task_role_arn            = aws_iam_role.migration_task.arn

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }

  tags = {
    ManagedBy          = "Terraform"
    TaskDefinitionRole = "Template"
  }

  volume {
    name = "tmp"
  }

  container_definitions = jsonencode([
    {
      name      = "migration"
      image     = "${aws_ecr_repository.api.repository_url}:${var.bootstrap_image_tag}"
      command   = ["node", "dist/migrate.js"]
      essential = true

      readonlyRootFilesystem = true

      environment = [
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
          name  = "DB_SECRET_ARN"
          value = aws_db_instance.database.master_user_secret[0].secret_arn
        },
        {
          name  = "DB_HOST"
          value = aws_db_instance.database.address
        },
        {
          name  = "DB_PORT"
          value = tostring(aws_db_instance.database.port)
        },
        {
          name  = "DB_NAME"
          value = var.db_name
        },
        {
          name  = "DB_SSL_ROOT_CERT"
          value = "/app/certs/eu-west-2-bundle.pem"
        },
        {
          name  = "MIGRATION_QUERY_TIMEOUT_MS"
          value = tostring(var.migration_query_timeout_ms)
        },
      ]

      linuxParameters = {
        initProcessEnabled = true
      }

      mountPoints = [
        {
          sourceVolume  = "tmp"
          containerPath = "/tmp"
          readOnly      = false
        },
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.migration.name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "migration"
        }
      }
    },
  ])
}

resource "aws_ecs_service" "api" {
  name = "${local.name}-api"

  cluster          = aws_ecs_cluster.this.id
  task_definition  = aws_ecs_task_definition.api.arn
  desired_count    = var.bootstrap_mode ? 0 : var.api_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  enable_ecs_managed_tags            = true
  enable_execute_command             = false
  health_check_grace_period_seconds  = 60
  propagate_tags                     = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  load_balancer {
    container_name   = "api"
    container_port   = var.container_port
    target_group_arn = aws_lb_target_group.api.arn
  }

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs.id]
    subnets          = [for availability_zone in local.availability_zones : aws_subnet.private_app[availability_zone].id]
  }

  lifecycle {
    # CI clones the latest Terraform template into immutable release revisions;
    # Application Auto Scaling owns desired_count after bootstrap. Terraform
    # retains the service envelope and continues publishing templates.
    ignore_changes = [
      desired_count,
      task_definition,
    ]
  }

  depends_on = [
    aws_ecs_cluster_capacity_providers.this,
    aws_lb_listener.http_forward,
    aws_lb_listener.http_redirect,
    aws_lb_listener.https,
    terraform_data.guardrails,
  ]
}

resource "aws_ecs_service" "worker" {
  name = "${local.name}-worker"

  cluster          = aws_ecs_cluster.this.id
  task_definition  = aws_ecs_task_definition.worker.arn
  desired_count    = var.bootstrap_mode ? 0 : var.worker_desired_count
  launch_type      = "FARGATE"
  platform_version = "LATEST"

  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100
  enable_ecs_managed_tags            = true
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.ecs.id]
    subnets          = [for availability_zone in local.availability_zones : aws_subnet.private_app[availability_zone].id]
  }

  lifecycle {
    # See the API service: live releases and autoscaled capacity are external
    # consumers of this Terraform-owned service/template envelope.
    ignore_changes = [
      desired_count,
      task_definition,
    ]
  }

  depends_on = [
    aws_ecs_cluster_capacity_providers.this,
    terraform_data.guardrails,
  ]
}
