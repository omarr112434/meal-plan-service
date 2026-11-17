#!/usr/bin/env bash
# Shows what is stored on Floci: the tables, how many items each has, and the latest plans.
#   bash infra/scripts/show-data.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1 AWS_PAGER=""
export AWS_PROFILE="${AWS_PROFILE:-floci}"

echo "Account (must be 000000000000 = Floci):"
aws sts get-caller-identity --query Account --output text
echo
echo "Tables:"
aws dynamodb list-tables --query TableNames --output table
echo
for table in MealPlans ShoppingLists; do
  count=$(aws dynamodb scan --table-name "$table" --select COUNT --query Count --output text)
  echo "$table: $count item(s)"
done
echo
echo "Meal plans (user, week, number of recipes):"
aws dynamodb scan --table-name MealPlans \
  --query 'Items[].[userId.S, weekStart.S, length(entries.L)]' --output table
