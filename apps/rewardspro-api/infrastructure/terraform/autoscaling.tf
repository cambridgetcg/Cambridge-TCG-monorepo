resource "aws_appautoscaling_target" "api" {
  max_capacity       = var.api_max_capacity
  min_capacity       = var.bootstrap_mode ? 0 : var.api_min_capacity
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.api.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  lifecycle {
    precondition {
      condition     = var.api_max_capacity >= var.api_min_capacity
      error_message = "api_max_capacity must be greater than or equal to api_min_capacity."
    }

    precondition {
      condition     = var.api_desired_count >= var.api_min_capacity && var.api_desired_count <= var.api_max_capacity
      error_message = "api_desired_count must be between api_min_capacity and api_max_capacity."
    }
  }
}

resource "aws_appautoscaling_policy" "api_cpu" {
  count = var.bootstrap_mode ? 0 : 1

  name               = "${local.name}-api-cpu"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.api_cpu_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

resource "aws_appautoscaling_policy" "api_memory" {
  count = var.bootstrap_mode ? 0 : 1

  name               = "${local.name}-api-memory"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.api.resource_id
  scalable_dimension = aws_appautoscaling_target.api.scalable_dimension
  service_namespace  = aws_appautoscaling_target.api.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.api_memory_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
  }
}

resource "aws_appautoscaling_target" "worker" {
  max_capacity       = var.worker_max_capacity
  min_capacity       = var.bootstrap_mode ? 0 : var.worker_min_capacity
  resource_id        = "service/${aws_ecs_cluster.this.name}/${aws_ecs_service.worker.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"

  lifecycle {
    precondition {
      condition     = var.worker_max_capacity >= var.worker_min_capacity
      error_message = "worker_max_capacity must be greater than or equal to worker_min_capacity."
    }

    precondition {
      condition     = var.worker_desired_count >= var.worker_min_capacity && var.worker_desired_count <= var.worker_max_capacity
      error_message = "worker_desired_count must be between worker_min_capacity and worker_max_capacity."
    }
  }
}

resource "aws_appautoscaling_policy" "worker_queue_depth" {
  count = var.bootstrap_mode ? 0 : 1

  name               = "${local.name}-worker-queue-depth"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.worker.resource_id
  scalable_dimension = aws_appautoscaling_target.worker.scalable_dimension
  service_namespace  = aws_appautoscaling_target.worker.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.worker_queue_depth_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60

    customized_metric_specification {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      statistic   = "Average"

      dimensions {
        name  = "QueueName"
        value = aws_sqs_queue.worker.name
      }
    }
  }
}
