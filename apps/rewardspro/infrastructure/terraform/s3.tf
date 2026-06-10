# S3 Bucket Configuration for Data Exports

# S3 Bucket for Exports
resource "aws_s3_bucket" "exports" {
  count = var.enable_s3_exports ? 1 : 0

  bucket = "${local.name_prefix}-exports"

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-exports"
    Type = "DataExports"
  })
}

# Bucket versioning
resource "aws_s3_bucket_versioning" "exports" {
  count = var.enable_s3_exports ? 1 : 0

  bucket = aws_s3_bucket.exports[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

# Server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "exports" {
  count = var.enable_s3_exports ? 1 : 0

  bucket = aws_s3_bucket.exports[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block public access
resource "aws_s3_bucket_public_access_block" "exports" {
  count = var.enable_s3_exports ? 1 : 0

  bucket = aws_s3_bucket.exports[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rules
resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  count = var.enable_s3_exports ? 1 : 0

  bucket = aws_s3_bucket.exports[0].id

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    filter {
      prefix = "exports/"
    }

    transition {
      days          = var.s3_expiration_days
      storage_class = "GLACIER"
    }

    expiration {
      days = 365
    }
  }

  rule {
    id     = "cleanup-temp-files"
    status = "Enabled"

    filter {
      prefix = "temp/"
    }

    expiration {
      days = 7
    }
  }

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# CORS configuration for pre-signed URLs
resource "aws_s3_bucket_cors_configuration" "exports" {
  count = var.enable_s3_exports ? 1 : 0

  bucket = aws_s3_bucket.exports[0].id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST"]
    allowed_origins = [var.vercel_app_url]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# Bucket policy
resource "aws_s3_bucket_policy" "exports" {
  count = var.enable_s3_exports ? 1 : 0

  bucket = aws_s3_bucket.exports[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnforceTLS"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.exports[0].arn,
          "${aws_s3_bucket.exports[0].arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}
