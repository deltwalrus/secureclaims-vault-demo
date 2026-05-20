#!/usr/bin/env sh
# Configures a running Vault server for the SecureClaims demo.
# Assumes VAULT_ADDR and VAULT_TOKEN are already set.
# Safe to re-run — existing mounts are skipped.
set -e

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-claims}"
DB_ADMIN_USER="${DB_ADMIN_USER:-vaultadmin}"
DB_ADMIN_PASSWORD="${DB_ADMIN_PASSWORD:?DB_ADMIN_PASSWORD is required}"
DB_CREDENTIAL_TTL="${DB_CREDENTIAL_TTL:-1h}"

echo "==> Enabling secrets engines..."

vault secrets enable -path=secret kv-v2 2>/dev/null || echo "  secret/ already enabled"
vault secrets enable transit 2>/dev/null          || echo "  transit/ already enabled"
vault secrets enable database 2>/dev/null         || echo "  database/ already enabled"

echo "==> Writing admin credentials to KV..."

vault kv put secret/claims-app/db-init \
  host="$DB_HOST" \
  port="$DB_PORT" \
  database="$DB_NAME" \
  username="$DB_ADMIN_USER" \
  password="$DB_ADMIN_PASSWORD"

echo "==> Creating Transit encryption keys..."

vault write -force transit/keys/claims-pii type=aes256-gcm96 2>/dev/null || echo "  claims-pii key already exists"

vault write -force transit/keys/claims-pii-convergent \
  type=aes256-gcm96 \
  convergent_encryption=true \
  derived=true 2>/dev/null || echo "  claims-pii-convergent key already exists"

echo "==> Configuring database secrets engine..."

vault write database/config/postgres \
  plugin_name=postgresql-database-plugin \
  allowed_roles="claims-app-role" \
  connection_url="postgresql://{{username}}:{{password}}@${DB_HOST}:${DB_PORT}/${DB_NAME}?sslmode=disable" \
  username="$DB_ADMIN_USER" \
  password="$DB_ADMIN_PASSWORD"

vault write database/roles/claims-app-role \
  db_name=postgres \
  creation_statements="
    CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}' INHERIT;
    GRANT USAGE ON SCHEMA public TO \"{{name}}\";
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";
  " \
  revocation_statements="
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";
    REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM \"{{name}}\";
    REVOKE USAGE ON SCHEMA public FROM \"{{name}}\";
    DROP ROLE IF EXISTS \"{{name}}\";
  " \
  default_ttl="$DB_CREDENTIAL_TTL" \
  max_ttl="$DB_CREDENTIAL_TTL"

echo "==> Writing app policy..."

vault policy write claims-app /setup/policy.hcl

echo "==> Creating app token..."

APP_TOKEN=$(vault token create \
  -policy=claims-app \
  -period=24h \
  -display-name=claims-app \
  -format=json | jq -r .auth.client_token)

echo ""
echo "Done. Set this in your app environment:"
echo "  VAULT_TOKEN=$APP_TOKEN"
echo ""
echo "Or if using docker-compose, add it to .env:"
echo "  VAULT_APP_TOKEN=$APP_TOKEN"
