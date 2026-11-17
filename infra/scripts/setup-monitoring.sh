#!/usr/bin/env bash
# Monitoring on Floci: turns the API's log lines into CloudWatch metrics and alarms.
#   - AuthFailures: requests with a missing, forged or expired token (event "auth_failed")
#   - ServerErrors: 500 errors (event "server_error")
# Run it once after the app has started (the log group is created by the API):
#   bash infra/scripts/setup-monitoring.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1 AWS_PAGER=""
export AWS_PROFILE="${AWS_PROFILE:-floci}"

LOG_GROUP="/recipe-organizer/api"
NAMESPACE="RecipeOrganizer"

aws logs create-log-group --log-group-name "$LOG_GROUP" 2>/dev/null || true
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --retention-in-days 30

aws logs put-metric-filter \
  --log-group-name "$LOG_GROUP" \
  --filter-name auth-failures \
  --filter-pattern '{ $.event = "auth_failed" }' \
  --metric-transformations metricName=AuthFailures,metricNamespace="$NAMESPACE",metricValue=1,defaultValue=0

aws logs put-metric-filter \
  --log-group-name "$LOG_GROUP" \
  --filter-name server-errors \
  --filter-pattern '{ $.event = "server_error" }' \
  --metric-transformations metricName=ServerErrors,metricNamespace="$NAMESPACE",metricValue=1,defaultValue=0

# 5 or more failed logins in 5 minutes looks like someone guessing or replaying tokens
aws cloudwatch put-metric-alarm \
  --alarm-name recipe-organizer-auth-failures \
  --alarm-description "5+ requests with a bad or missing token in 5 minutes" \
  --namespace "$NAMESPACE" --metric-name AuthFailures \
  --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold 5 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching

aws cloudwatch put-metric-alarm \
  --alarm-name recipe-organizer-server-errors \
  --alarm-description "Any 500 error from the API" \
  --namespace "$NAMESPACE" --metric-name ServerErrors \
  --statistic Sum --period 300 --evaluation-periods 1 \
  --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching

echo "Metric filters:"
aws logs describe-metric-filters --log-group-name "$LOG_GROUP" --query 'metricFilters[].filterName' --output text
echo "Alarms:"
aws cloudwatch describe-alarms --alarm-name-prefix recipe-organizer \
  --query 'MetricAlarms[].[AlarmName, StateValue]' --output table
