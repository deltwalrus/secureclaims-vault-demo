import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import asyncpg

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
_cred_info: dict = {}

CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS claims (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    ssn_encrypted    TEXT NOT NULL,
    dob_encrypted    TEXT NOT NULL,
    amount_encrypted TEXT NOT NULL,
    claim_type       TEXT NOT NULL,
    description      TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
"""


def get_cred_info() -> dict:
    return dict(_cred_info)


@asynccontextmanager
async def get_db() -> AsyncGenerator[asyncpg.Connection, None]:
    assert _pool is not None, "Database pool not initialized"
    async with _pool.acquire() as conn:
        yield conn


async def _make_pool(host: str, port: int, database: str, user: str, password: str) -> asyncpg.Pool:
    ssl = os.getenv("DB_SSL", "require")
    return await asyncpg.create_pool(
        host=host,
        port=port,
        database=database,
        user=user,
        password=password,
        min_size=2,
        max_size=10,
        ssl=ssl if ssl != "disable" else None,
    )


async def _refresh_credentials(vault) -> None:
    global _pool, _cred_info
    username, password, ttl, lease_id = vault.get_db_credentials()
    _cred_info = {
        "username": username,
        "lease_id": lease_id,
        "ttl": ttl,
        "obtained_at": time.time(),
        "expires_at": time.time() + ttl,
    }

    new_pool = await _make_pool(
        host=os.environ["DB_HOST"],
        port=int(os.getenv("DB_PORT", "5432")),
        database=os.environ["DB_NAME"],
        user=username,
        password=password,
    )

    old_pool = _pool
    _pool = new_pool

    if old_pool:
        await old_pool.close()

    logger.info("DB credential rotated: user=%s ttl=%ds", username, ttl)


async def _credential_refresher(vault) -> None:
    while True:
        ttl = _cred_info.get("ttl", 300)
        await asyncio.sleep(ttl * 0.75)
        try:
            await _refresh_credentials(vault)
        except Exception as exc:
            logger.error("Credential refresh failed: %s", exc)
            await asyncio.sleep(15)


async def refresh_credentials(vault) -> None:
    await _refresh_credentials(vault)


async def init_db(vault) -> None:
    """
    Bootstrap sequence on startup:
      1. Read admin DB credentials from Vault KV — never from env vars.
      2. Create the schema using the admin connection.
      3. Switch to a short-lived dynamic credential for all app queries.
      4. Seed sample data if the table is empty.
      5. Start the background credential refresher.
    """
    # Step 1: admin creds live in Vault KV, not in the environment.
    # Write them once: vault kv put secret/claims-app/db-init host=... port=... ...
    admin = vault.read_secret("claims-app/db-init")
    admin_pool = await _make_pool(
        host=admin["host"],
        port=int(admin["port"]),
        database=admin["database"],
        user=admin["username"],
        password=admin["password"],
    )
    async with admin_pool.acquire() as conn:
        await conn.execute(CREATE_TABLE_SQL)
    await admin_pool.close()

    # Step 2: switch to dynamic credentials for all normal queries.
    await _refresh_credentials(vault)

    # Step 3: seed if empty.
    async with get_db() as conn:
        count = await conn.fetchval("SELECT COUNT(*) FROM claims")
        if count == 0:
            await _seed(vault)

    # Step 4: background task rotates credentials before TTL expires.
    asyncio.create_task(_credential_refresher(vault))


async def _seed(vault) -> None:
    from seed import SEED_CLAIMS

    async with get_db() as conn:
        for claim in SEED_CLAIMS:
            encrypted_ssn = vault.encrypt(claim["ssn"])
            encrypted_dob = vault.encrypt(claim["date_of_birth"])
            encrypted_amount = vault.encrypt(str(claim["amount"]))

            await conn.execute(
                """INSERT INTO claims
                   (name, ssn_encrypted, dob_encrypted, amount_encrypted,
                    claim_type, description, status)
                   VALUES ($1, $2, $3, $4, $5, $6, 'pending')""",
                claim["name"],
                encrypted_ssn,
                encrypted_dob,
                encrypted_amount,
                claim["claim_type"],
                claim["description"],
            )
    logger.info("Seed data inserted (%d claims)", len(SEED_CLAIMS))
