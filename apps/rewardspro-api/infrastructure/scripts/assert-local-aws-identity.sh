#!/usr/bin/env bash

set -euo pipefail

if [[ "${AWS_PROFILE:-}" != "rewardspro-admin" ]]; then
  echo "Refusing: set AWS_PROFILE=rewardspro-admin for local RewardsPro AWS work." >&2
  exit 1
fi

if [[ "${AWS_REGION:-}" != "eu-west-2" ]]; then
  echo "Refusing: set AWS_REGION=eu-west-2 for the RewardsPro v2 stack." >&2
  exit 1
fi

rp_expected_account_id="${REWARDSPRO_AWS_ACCOUNT_ID:-}"
if [[ ! "${rp_expected_account_id}" =~ ^[0-9]{12}$ ]]; then
  echo "Refusing: set REWARDSPRO_AWS_ACCOUNT_ID to the reviewed 12-digit account." >&2
  exit 1
fi

rp_actual_account_id="$(
  AWS_PAGER="" aws sts get-caller-identity --query Account --output text
)"
rp_caller_arn="$(
  AWS_PAGER="" aws sts get-caller-identity --query Arn --output text
)"

if [[ "${rp_actual_account_id}" != "${rp_expected_account_id}" ]]; then
  echo "Refusing: the authenticated AWS account does not match the reviewed account." >&2
  exit 1
fi

if [[ "${rp_caller_arn}" == arn:*:iam::*:root ]]; then
  echo "Refusing: RewardsPro infrastructure must never run as the AWS account root." >&2
  exit 1
fi

printf 'AWS identity preflight passed: %s in %s\n' \
  "${rp_caller_arn}" \
  "${AWS_REGION}"
