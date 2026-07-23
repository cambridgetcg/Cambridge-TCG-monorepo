resource "aws_db_subnet_group" "database" {
  name       = "${local.name}-database"
  subnet_ids = [for availability_zone in local.availability_zones : aws_subnet.private_db[availability_zone].id]

  tags = {
    Name = "${local.name}-database"
  }
}

resource "aws_db_parameter_group" "postgres16" {
  name        = "${local.name}-postgres16"
  description = "RewardsPro PostgreSQL 16 settings, including mandatory TLS"
  family      = "postgres16"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }
}

resource "aws_db_instance" "database" {
  identifier = "${local.name}-postgres"

  engine                   = "postgres"
  engine_lifecycle_support = "open-source-rds-extended-support-disabled"
  engine_version           = var.db_engine_version
  instance_class           = var.db_instance_class

  db_name  = var.db_name
  port     = 5432
  username = var.db_master_username

  manage_master_user_password = true

  allocated_storage     = var.db_allocated_storage_gib
  max_allocated_storage = var.db_max_allocated_storage_gib
  storage_encrypted     = true
  storage_type          = "gp3"

  db_subnet_group_name   = aws_db_subnet_group.database.name
  parameter_group_name   = aws_db_parameter_group.postgres16.name
  publicly_accessible    = false
  vpc_security_group_ids = [aws_security_group.database.id]

  multi_az = true

  backup_retention_period   = var.db_backup_retention_days
  copy_tags_to_snapshot     = true
  delete_automated_backups  = false
  deletion_protection       = true
  final_snapshot_identifier = "${local.name}-final"
  skip_final_snapshot       = false

  auto_minor_version_upgrade  = true
  allow_major_version_upgrade = false
  apply_immediately           = false

  enabled_cloudwatch_logs_exports = [
    "postgresql",
    "upgrade",
  ]
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  lifecycle {
    precondition {
      condition     = var.db_max_allocated_storage_gib >= ceil(var.db_allocated_storage_gib * 1.1)
      error_message = "db_max_allocated_storage_gib must be at least 10 percent greater than db_allocated_storage_gib for RDS storage autoscaling."
    }
  }

  depends_on = [terraform_data.guardrails]
}
