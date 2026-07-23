resource "aws_security_group" "alb" {
  name                   = "${local.name}-alb"
  description            = "Public ingress to the RewardsPro API load balancer"
  revoke_rules_on_delete = true
  vpc_id                 = aws_vpc.this.id

  tags = {
    Name = "${local.name}-alb"
  }
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id

  cidr_ipv4   = "0.0.0.0/0"
  description = "Public HTTP; redirects to HTTPS when a certificate is configured"
  from_port   = 80
  ip_protocol = "tcp"
  to_port     = 80
}

resource "aws_vpc_security_group_ingress_rule" "alb_https" {
  count = var.certificate_arn == null ? 0 : 1

  security_group_id = aws_security_group.alb.id

  cidr_ipv4   = "0.0.0.0/0"
  description = "Public HTTPS"
  from_port   = 443
  ip_protocol = "tcp"
  to_port     = 443
}

resource "aws_security_group" "ecs" {
  name                   = "${local.name}-ecs"
  description            = "Private Fargate tasks"
  revoke_rules_on_delete = true
  vpc_id                 = aws_vpc.this.id

  tags = {
    Name = "${local.name}-ecs"
  }
}

resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id = aws_security_group.ecs.id

  description                  = "API traffic from the ALB"
  from_port                    = var.container_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.alb.id
  to_port                      = var.container_port
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id = aws_security_group.alb.id

  description                  = "Forward API traffic to Fargate"
  from_port                    = var.container_port
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id
  to_port                      = var.container_port
}

resource "aws_vpc_security_group_egress_rule" "ecs_https" {
  security_group_id = aws_security_group.ecs.id

  cidr_ipv4   = "0.0.0.0/0"
  description = "TLS egress through NAT for AWS APIs and Shopify"
  from_port   = 443
  ip_protocol = "tcp"
  to_port     = 443
}

resource "aws_vpc_security_group_egress_rule" "ecs_dns_udp" {
  security_group_id = aws_security_group.ecs.id

  cidr_ipv4   = "${cidrhost(var.vpc_cidr, 2)}/32"
  description = "DNS to the VPC resolver"
  from_port   = 53
  ip_protocol = "udp"
  to_port     = 53
}

resource "aws_vpc_security_group_egress_rule" "ecs_dns_tcp" {
  security_group_id = aws_security_group.ecs.id

  cidr_ipv4   = "${cidrhost(var.vpc_cidr, 2)}/32"
  description = "TCP DNS fallback to the VPC resolver"
  from_port   = 53
  ip_protocol = "tcp"
  to_port     = 53
}

resource "aws_security_group" "database" {
  name                   = "${local.name}-database"
  description            = "PostgreSQL ingress only from RewardsPro Fargate tasks"
  revoke_rules_on_delete = true
  vpc_id                 = aws_vpc.this.id

  tags = {
    Name = "${local.name}-database"
  }
}

resource "aws_vpc_security_group_ingress_rule" "database_from_ecs" {
  security_group_id = aws_security_group.database.id

  description                  = "PostgreSQL from API, worker, and migration tasks"
  from_port                    = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.ecs.id
  to_port                      = 5432
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_database" {
  security_group_id = aws_security_group.ecs.id

  description                  = "PostgreSQL to RDS"
  from_port                    = 5432
  ip_protocol                  = "tcp"
  referenced_security_group_id = aws_security_group.database.id
  to_port                      = 5432
}
