resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${local.name}-vpc"
  }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name}-igw"
  }
}

resource "aws_subnet" "public" {
  for_each = local.public_subnets

  availability_zone       = each.key
  cidr_block              = each.value.cidr
  map_public_ip_on_launch = false
  vpc_id                  = aws_vpc.this.id

  tags = {
    Name = "${local.name}-public-${each.key}"
    Tier = "public"
  }
}

resource "aws_subnet" "private_app" {
  for_each = local.private_app_subnets

  availability_zone       = each.key
  cidr_block              = each.value.cidr
  map_public_ip_on_launch = false
  vpc_id                  = aws_vpc.this.id

  tags = {
    Name = "${local.name}-app-${each.key}"
    Tier = "private-app"
  }
}

resource "aws_subnet" "private_db" {
  for_each = local.private_db_subnets

  availability_zone       = each.key
  cidr_block              = each.value.cidr
  map_public_ip_on_launch = false
  vpc_id                  = aws_vpc.this.id

  tags = {
    Name = "${local.name}-db-${each.key}"
    Tier = "isolated-db"
  }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name}-public"
  }
}

resource "aws_route" "public_internet" {
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
  route_table_id         = aws_route_table.public.id
}

resource "aws_route_table_association" "public" {
  for_each = aws_subnet.public

  route_table_id = aws_route_table.public.id
  subnet_id      = each.value.id
}

resource "aws_eip" "nat" {
  count = var.nat_gateway_count

  domain = "vpc"

  depends_on = [aws_internet_gateway.this]

  tags = {
    Name = "${local.name}-nat-${count.index + 1}"
  }
}

resource "aws_nat_gateway" "this" {
  count = var.nat_gateway_count

  allocation_id     = aws_eip.nat[count.index].id
  connectivity_type = "public"
  subnet_id         = aws_subnet.public[local.availability_zones[count.index]].id

  depends_on = [aws_internet_gateway.this]

  tags = {
    Name = "${local.name}-nat-${local.availability_zones[count.index]}"
  }
}

resource "aws_route_table" "private_app" {
  for_each = local.private_app_subnets

  vpc_id = aws_vpc.this.id

  tags = {
    Name = "${local.name}-app-${each.key}"
  }
}

resource "aws_route" "private_app_egress" {
  for_each = local.private_app_subnets

  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[min(each.value.index, var.nat_gateway_count - 1)].id
  route_table_id         = aws_route_table.private_app[each.key].id
}

resource "aws_route_table_association" "private_app" {
  for_each = aws_subnet.private_app

  route_table_id = aws_route_table.private_app[each.key].id
  subnet_id      = each.value.id
}

resource "aws_route_table" "private_db" {
  for_each = local.private_db_subnets

  vpc_id = aws_vpc.this.id

  # Deliberately no default route: database subnets are isolated.
  tags = {
    Name = "${local.name}-db-${each.key}"
  }
}

resource "aws_route_table_association" "private_db" {
  for_each = aws_subnet.private_db

  route_table_id = aws_route_table.private_db[each.key].id
  subnet_id      = each.value.id
}

resource "aws_cloudwatch_log_group" "vpc_flow" {
  count = var.enable_vpc_flow_logs ? 1 : 0

  name              = "/aws/vpc/${local.name}/flow"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "vpc_flow_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["vpc-flow-logs.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_iam_role" "vpc_flow" {
  count = var.enable_vpc_flow_logs ? 1 : 0

  name               = "${local.name}-vpc-flow"
  assume_role_policy = data.aws_iam_policy_document.vpc_flow_assume.json
}

data "aws_iam_policy_document" "vpc_flow" {
  count = var.enable_vpc_flow_logs ? 1 : 0

  statement {
    sid = "WriteFlowLogs"
    actions = [
      "logs:CreateLogStream",
      "logs:DescribeLogStreams",
      "logs:PutLogEvents",
    ]
    resources = [
      "${one(aws_cloudwatch_log_group.vpc_flow[*].arn)}:*",
    ]
  }

  statement {
    sid       = "FindFlowLogGroup"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "vpc_flow" {
  count = var.enable_vpc_flow_logs ? 1 : 0

  name   = "write-flow-logs"
  policy = data.aws_iam_policy_document.vpc_flow[0].json
  role   = one(aws_iam_role.vpc_flow[*].id)
}

resource "aws_flow_log" "this" {
  count = var.enable_vpc_flow_logs ? 1 : 0

  iam_role_arn    = one(aws_iam_role.vpc_flow[*].arn)
  log_destination = one(aws_cloudwatch_log_group.vpc_flow[*].arn)
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.this.id
}
