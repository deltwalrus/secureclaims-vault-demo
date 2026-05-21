#!/usr/bin/env bash
# Raw Vault HTTP API examples — no SDK required.
# These translate directly to any language with an HTTP client.
#
# Prerequisites:
#   export VAULT_ADDR=http://localhost:8200
#   export VAULT_TOKEN=<your-token>
#   brew install jq   # for pretty output

set -euo pipefail
: "${VAULT_ADDR:?set VAULT_ADDR}"
: "${VAULT_TOKEN:?set VAULT_TOKEN}"

vault_api() {
  curl -sf -H "X-Vault-Token: $VAULT_TOKEN" "$@"
}

echo "=== Transit: encrypt / decrypt ==="

# Vault requires base64-encoded plaintext
PLAINTEXT_B64=$(printf '123-45-6789' | base64)

CT=$(vault_api -X POST \
  -d "{\"plaintext\": \"$PLAINTEXT_B64\"}" \
  "$VAULT_ADDR/v1/transit/encrypt/my-key" | jq -r .data.ciphertext)
echo "Ciphertext: $CT"

PT_B64=$(vault_api -X POST \
  -d "{\"ciphertext\": \"$CT\"}" \
  "$VAULT_ADDR/v1/transit/decrypt/my-key" | jq -r .data.plaintext)
echo "Plaintext:  $(printf '%s' "$PT_B64" | base64 -d)"

echo ""
echo "=== Transit: key rotation ==="

vault_api -X POST "$VAULT_ADDR/v1/transit/keys/my-key/rotate" > /dev/null
KEY_VER=$(vault_api "$VAULT_ADDR/v1/transit/keys/my-key" | jq .data.latest_version)
echo "Key is now at version $KEY_VER"

echo ""
echo "=== Transit: rewrap old ciphertext under latest key ==="

CT_NEW=$(vault_api -X POST \
  -d "{\"ciphertext\": \"$CT\"}" \
  "$VAULT_ADDR/v1/transit/rewrap/my-key" | jq -r .data.ciphertext)
echo "Rewrapped: $CT_NEW"

echo ""
echo "=== Transit: batch encrypt ==="

vault_api -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "batch_input": [
      {"plaintext": "'"$(printf 'alice@example.com' | base64)"'"},
      {"plaintext": "'"$(printf '555-867-5309' | base64)"'"},
      {"plaintext": "'"$(printf '1985-03-22' | base64)"'"}
    ]
  }' \
  "$VAULT_ADDR/v1/transit/encrypt/my-key" | jq '[.data.batch_results[].ciphertext]'

echo ""
echo "=== KV v2: write / read ==="

vault_api -X POST \
  -H "Content-Type: application/json" \
  -d '{"data": {"api_key": "abc123", "timeout": "30"}}' \
  "$VAULT_ADDR/v1/secret/data/myapp/config" | jq .data

vault_api "$VAULT_ADDR/v1/secret/data/myapp/config" | jq .data.data

echo ""
echo "=== KV v2: read specific version ==="

vault_api "$VAULT_ADDR/v1/secret/data/myapp/config?version=1" | jq .data.data

echo ""
echo "=== KV v2: list keys ==="

vault_api -X LIST "$VAULT_ADDR/v1/secret/metadata/myapp" | jq .data.keys

echo ""
echo "=== Dynamic DB credentials ==="

CREDS=$(vault_api "$VAULT_ADDR/v1/database/creds/my-app-role")
echo "$CREDS" | jq '{username: .data.username, lease_duration: .lease_duration, lease_id: .lease_id}'

LEASE_ID=$(echo "$CREDS" | jq -r .lease_id)

echo ""
echo "=== Lease renew ==="

vault_api -X PUT \
  -d "{\"lease_id\": \"$LEASE_ID\", \"increment\": 3600}" \
  "$VAULT_ADDR/v1/sys/leases/renew" | jq .lease_duration

echo ""
echo "=== Lease revoke ==="

vault_api -X PUT \
  -d "{\"lease_id\": \"$LEASE_ID\"}" \
  "$VAULT_ADDR/v1/sys/leases/revoke"
echo "Lease revoked."
