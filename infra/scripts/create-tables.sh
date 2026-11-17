#!/usr/bin/env bash
# Creates the two DynamoDB tables on Floci if they are missing.
# The API already does this when it starts (AUTO_CREATE_TABLES=true); this script is for
# doing it by hand, e.g. after "docker compose down -v".
#   bash infra/scripts/create-tables.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1 AWS_PAGER=""
export AWS_PROFILE="${AWS_PROFILE:-floci}"

create_table() {
  local name="$1" sort_key="$2"
  if aws dynamodb describe-table --table-name "$name" >/dev/null 2>&1; then
    echo "$name already exists"
    return
  fi
  aws dynamodb create-table \
    --table-name "$name" \
    --attribute-definitions AttributeName=userId,AttributeType=S AttributeName="$sort_key",AttributeType=S \
    --key-schema AttributeName=userId,KeyType=HASH AttributeName="$sort_key",KeyType=RANGE \
    --billing-mode PAY_PER_REQUEST >/dev/null
  aws dynamodb wait table-exists --table-name "$name"
  echo "$name created"
}

create_table MealPlans weekStart
create_table ShoppingLists id
