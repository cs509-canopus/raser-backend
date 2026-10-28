#!/usr/bin/env bash
# Creates the 6 stage databases on the shared RDS instance and applies the schema to each.
# Run after the DB tunnel is up (see scripts/test-tunnel.sh for the bastion pattern).
#
#   DB_HOST=<rds endpoint> DB_PORT=<local forwarded port> scripts/create-databases.sh

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-raser_admin}"

DATABASES=(production staging asuyer msegui kchang kgarg)

for db in "${DATABASES[@]}"; do
  echo "creating $db"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $db;" || true
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$db" -f "$(dirname "$0")/../db/schema.sql"
done
