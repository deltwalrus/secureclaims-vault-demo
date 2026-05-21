#!/usr/bin/env python3
"""
Dynamic database credentials: no passwords in config, Vault manages DB users.

Vault creates a short-lived PostgreSQL role on demand. When the TTL expires,
Vault drops it automatically. Your app never stores a password — it just asks
Vault for credentials at startup and refreshes before expiry.

Vault setup:
  vault secrets enable database

  vault write database/config/my-postgres \
    plugin_name=postgresql-database-plugin \
    allowed_roles="my-app-role" \
    connection_url="postgresql://{{username}}:{{password}}@localhost:5432/mydb?sslmode=disable" \
    username=vaultadmin \
    password=adminpass

  vault write database/roles/my-app-role \
    db_name=my-postgres \
    creation_statements="
      CREATE ROLE \"{{name}}\" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}' INHERIT;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO \"{{name}}\";
      GRANT USAGE ON SCHEMA public TO \"{{name}}\";
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO \"{{name}}\";
    " \
    revocation_statements="
      REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM \"{{name}}\";
      REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM \"{{name}}\";
      DROP ROLE IF EXISTS \"{{name}}\";
    " \
    default_ttl="1h" \
    max_ttl="4h"

Environment:
  export VAULT_ADDR=http://localhost:8200
  export VAULT_TOKEN=<your-token>
  export VAULT_DB_ROLE=my-app-role   # optional

Dependencies:
  pip install hvac
  pip install asyncpg   # only needed for the actual Postgres connection
"""
import asyncio
import os

import hvac

VAULT_ADDR = os.environ["VAULT_ADDR"]
VAULT_TOKEN = os.environ["VAULT_TOKEN"]
DB_ROLE = os.getenv("VAULT_DB_ROLE", "my-app-role")


def get_credentials(client: hvac.Client) -> dict:
    result = client.secrets.database.generate_credentials(name=DB_ROLE)
    return {
        "username": result["data"]["username"],   # v-token-my-app-role-XxXxXx
        "password": result["data"]["password"],
        "ttl":      result["lease_duration"],     # seconds
        "lease_id": result["lease_id"],
    }


def renew_lease(client: hvac.Client, lease_id: str, increment: int = 3600) -> int:
    """Extend a lease before it expires. Returns the new TTL in seconds."""
    result = client.sys.renew_lease(lease_id=lease_id, increment=increment)
    return result["lease_duration"]


def revoke_lease(client: hvac.Client, lease_id: str) -> None:
    """Immediately invalidate a specific credential — Vault drops the DB user."""
    client.sys.revoke_lease(lease_id=lease_id)


async def background_refresher(client: hvac.Client, cred_state: dict) -> None:
    """
    Refresh credentials at 75% of TTL so the app never hits an expired connection.

    In production, run this as a background asyncio task alongside your request
    handlers. When it gets new creds, recreate your connection pool with them.
    """
    while True:
        ttl = cred_state.get("ttl", 300)
        await asyncio.sleep(ttl * 0.75)
        try:
            cred_state.update(get_credentials(client))
            print(f"[refresh] new user: {cred_state['username']} TTL={cred_state['ttl']}s")
        except Exception as exc:
            print(f"[refresh] failed: {exc}")


if __name__ == "__main__":
    client = hvac.Client(url=VAULT_ADDR, token=VAULT_TOKEN)

    # --- Get credentials ---
    creds = get_credentials(client)
    print(f"Username:  {creds['username']}")
    print(f"TTL:       {creds['ttl']}s")
    print(f"Lease ID:  {creds['lease_id']}")

    # Use creds to connect — example with asyncpg (uncomment to test):
    # import asyncpg
    # conn = await asyncpg.connect(
    #     host=os.getenv("DB_HOST", "localhost"),
    #     port=int(os.getenv("DB_PORT", "5432")),
    #     database=os.getenv("DB_NAME", "mydb"),
    #     user=creds["username"],
    #     password=creds["password"],
    # )

    # --- Renew before expiry ---
    new_ttl = renew_lease(client, creds["lease_id"], increment=3600)
    print(f"\nLease renewed. New TTL: {new_ttl}s")

    # --- Revoke when done ---
    # (or just let Vault expire it automatically)
    revoke_lease(client, creds["lease_id"])
    print("Lease revoked — Vault has dropped the DB user.")
