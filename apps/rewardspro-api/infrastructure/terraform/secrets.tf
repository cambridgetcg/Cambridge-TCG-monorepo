# These resources intentionally have no aws_secretsmanager_secret_version.
# Operators populate values out-of-band so plaintext never enters Terraform state.
resource "aws_secretsmanager_secret" "application_database" {
  name                    = "${local.name}/database/application"
  description             = "Least-privilege RewardsPro runtime PostgreSQL connection; never the RDS master credential"
  recovery_window_in_days = local.is_production ? 30 : 7
}

resource "aws_secretsmanager_secret" "shopify_api" {
  name                    = "${local.name}/shopify/api"
  description             = "RewardsPro Shopify API secret placeholder"
  recovery_window_in_days = local.is_production ? 30 : 7
}

resource "aws_secretsmanager_secret" "operator_token" {
  name                    = "${local.name}/operator/token"
  description             = "RewardsPro operator token placeholder"
  recovery_window_in_days = local.is_production ? 30 : 7
}
