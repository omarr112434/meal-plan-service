#!/usr/bin/env bash
# Shows the API's logs from CloudWatch Logs on Floci.
#   bash infra/scripts/tail-logs.sh              last 30 minutes
#   bash infra/scripts/tail-logs.sh --follow     keep watching (Ctrl+C to stop)
#   bash infra/scripts/tail-logs.sh --denied     only refused requests (401 and 403)
set -euo pipefail
export MSYS_NO_PATHCONV=1 AWS_PAGER=""
export AWS_PROFILE="${AWS_PROFILE:-floci}"

LOG_GROUP="/recipe-organizer/api"

case "${1:-}" in
  --follow) aws logs tail "$LOG_GROUP" --since 10m --follow ;;
  --denied) aws logs filter-log-events --log-group-name "$LOG_GROUP" \
              --filter-pattern '{ $.event = "auth_failed" || $.event = "access_denied" }' \
              --query 'events[].message' --output text ;;
  *) aws logs tail "$LOG_GROUP" --since 30m ;;
esac
