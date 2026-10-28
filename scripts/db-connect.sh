#!/usr/bin/env bash
# Opens psql on the shared RDS instance, connected to your stage's database:
#   localhost:$LOCAL_PORT -> EC2 Instance Connect Endpoint -> ssh bastion -> RDS:5432
# The tunnel is closed when psql exits. The bastion stops itself after 30 idle minutes.
#
#   scripts/db-connect.sh                      # interactive psql on database $RASER_STAGE
#   scripts/db-connect.sh -c 'select now();'   # extra arguments are passed to psql
#   DB_NAME=postgres scripts/db-connect.sh     # connect to a different database
#   TUNNEL_ONLY=1 scripts/db-connect.sh        # just hold the tunnel open (for other tools or
#                                              # create-databases.sh) until Ctrl-C
#   LOCAL_PORT=15432 scripts/db-connect.sh     # if 5433 is already taken on your laptop
set -euo pipefail
source "$(dirname "$0")/lib/bastion.sh"
export AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}"
LOCAL_PORT="${LOCAL_PORT:-5433}"
DB_USER="raser_admin"
FORWARD_LOG="$(mktemp -t raser-forward.XXXXXX)"
FORWARD_PID=""

if [[ -z "${DB_NAME:-}" && -z "${RASER_STAGE:-}" && "${TUNNEL_ONLY:-0}" != "1" ]]; then
  echo "FAIL: set RASER_STAGE to your stage name (e.g. export RASER_STAGE=asuyer),"
  echo "      or pass DB_NAME=<database> for a one-off connection."
  exit 1
fi
DB_NAME="${DB_NAME:-${RASER_STAGE:-postgres}}"

cleanup() {
  [[ -n "$FORWARD_PID" ]] && kill "$FORWARD_PID" 2>/dev/null
  rm -f "$FORWARD_LOG"
}
trap cleanup EXIT

for tool in aws ssh ssh-keygen psql node; do
  command -v "$tool" >/dev/null || { echo "FAIL: '$tool' is not installed."; exit 1; }
done
if port_in_use "$LOCAL_PORT"; then
  echo "FAIL: something on your laptop is already listening on localhost:$LOCAL_PORT."
  echo "      Stop it or rerun with LOCAL_PORT=15432 scripts/db-connect.sh"
  exit 1
fi

echo "Reading stack outputs..."
EICE_ID="$(stack_output NetworkStack EicEndpointId)"
BASTION_ID="$(stack_output NetworkStack BastionInstanceId)"
DB_HOST="$(stack_output DatabaseStack DbEndpoint)"
SECRET_ARN="$(stack_output DatabaseStack DbSecretArn)"
[[ -n "$DB_HOST" && "$DB_HOST" != "None" ]] || { echo "FAIL: DatabaseStack has no DbEndpoint output. Is it deployed?"; exit 1; }

echo "Making sure the bastion is running..."
ensure_bastion_running

echo "Opening tunnel: localhost:$LOCAL_PORT -> $BASTION_ID -> $DB_HOST:5432"
start_forward "$LOCAL_PORT" "$DB_HOST" 5432 "$FORWARD_LOG" || exit 1

if [[ "${TUNNEL_ONLY:-0}" == "1" ]]; then
  echo
  echo "Tunnel is up. Connect with host=localhost port=$LOCAL_PORT user=$DB_USER sslmode=require"
  echo "Password:  aws secretsmanager get-secret-value --secret-id $SECRET_ARN --query SecretString --output text"
  echo "Press Ctrl-C to close the tunnel."
  wait "$FORWARD_PID"
  exit 0
fi

# SecretString is JSON ({"username": ..., "password": ..., ...}); node is already in the dev shell.
PGPASSWORD="$(aws secretsmanager get-secret-value --secret-id "$SECRET_ARN" \
  --query SecretString --output text \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).password))')"
export PGPASSWORD

echo "Connecting to database '$DB_NAME' as $DB_USER"
# An explicit conninfo string overrides the PG* variables the dev shell sets for the local postgres.
# No exec, so the EXIT trap still closes the tunnel when psql quits.
psql "host=localhost port=$LOCAL_PORT user=$DB_USER dbname=$DB_NAME sslmode=require" "$@"
