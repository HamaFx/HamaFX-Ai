#!/bin/bash
# Auto-create the langfuse database if it doesn't exist.
# Called by the postgres container's /docker-entrypoint-initdb.d/
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE langfuse'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'langfuse')\gexec
EOSQL
