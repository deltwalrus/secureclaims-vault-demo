# Policy for the claims app service account.
# Grants exactly the paths and capabilities the app needs — nothing more.

path "secret/data/claims-app/db-init" {
  capabilities = ["read"]
}

path "transit/encrypt/claims-pii" {
  capabilities = ["update"]
}

path "transit/decrypt/claims-pii" {
  capabilities = ["update"]
}

path "transit/keys/claims-pii" {
  capabilities = ["read"]
}

path "transit/keys/claims-pii/rotate" {
  capabilities = ["update"]
}

path "transit/rewrap/claims-pii" {
  capabilities = ["update"]
}

path "database/creds/claims-app-role" {
  capabilities = ["read"]
}

path "sys/leases/renew" {
  capabilities = ["update"]
}

path "sys/leases/revoke" {
  capabilities = ["update"]
}

path "sys/leases/revoke-force/database/creds/claims-app-role" {
  capabilities = ["sudo", "update"]
}
