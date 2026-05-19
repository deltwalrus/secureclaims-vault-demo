import asyncio
import json
import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from audit import audit_log
from database import get_cred_info, get_db, init_db, refresh_credentials
from models import ClaimCreate, ClaimRaw, ClaimResponse
from vault_client import TRANSIT_KEY, VaultClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

vault: VaultClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    global vault
    vault = VaultClient()
    await init_db(vault)
    yield


app = FastAPI(title="SecureClaims Demo", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ------------------------------------------------------------------ #
# Health                                                               #
# ------------------------------------------------------------------ #


@app.get("/health")
async def health():
    return {"status": "ok", "ts": time.time()}


# ------------------------------------------------------------------ #
# Claims                                                               #
# ------------------------------------------------------------------ #


@app.post("/api/claims", response_model=ClaimResponse)
async def create_claim(claim: ClaimCreate):
    encrypted_ssn = vault.encrypt(claim.ssn, field="SSN")
    encrypted_dob = vault.encrypt(claim.date_of_birth, field="DOB")
    encrypted_amount = vault.encrypt(str(claim.amount), field="amount")

    async with get_db() as conn:
        row = await conn.fetchrow(
            """INSERT INTO claims
               (name, ssn_encrypted, dob_encrypted, amount_encrypted,
                claim_type, description, status)
               VALUES ($1, $2, $3, $4, $5, $6, 'pending')
               RETURNING id, name, claim_type, description, status, created_at""",
            claim.name,
            encrypted_ssn,
            encrypted_dob,
            encrypted_amount,
            claim.claim_type,
            claim.description,
        )

    return ClaimResponse(
        id=row["id"],
        name=row["name"],
        ssn=claim.ssn,
        date_of_birth=claim.date_of_birth,
        amount=claim.amount,
        claim_type=row["claim_type"],
        description=row["description"],
        status=row["status"],
        created_at=row["created_at"],
    )


@app.get("/api/claims", response_model=list[ClaimResponse])
async def list_claims():
    async with get_db() as conn:
        rows = await conn.fetch("SELECT * FROM claims ORDER BY created_at DESC")

    result = []
    for row in rows:
        result.append(
            ClaimResponse(
                id=row["id"],
                name=row["name"],
                ssn=vault.decrypt(row["ssn_encrypted"], _log=False),
                date_of_birth=vault.decrypt(row["dob_encrypted"], _log=False),
                amount=float(vault.decrypt(row["amount_encrypted"], _log=False)),
                claim_type=row["claim_type"],
                description=row["description"],
                status=row["status"],
                created_at=row["created_at"],
            )
        )
    if result:
        audit_log.add("transit/decrypt", f"{TRANSIT_KEY} ×{len(result)}", "SUCCESS")
    return result


@app.delete("/api/claims/{claim_id}", status_code=204)
async def delete_claim(claim_id: int):
    try:
        async with get_db() as conn:
            result = await conn.execute("DELETE FROM claims WHERE id = $1", claim_id)
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Claim not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/api/claims/raw", response_model=list[ClaimRaw])
async def list_claims_raw():
    async with get_db() as conn:
        rows = await conn.fetch("SELECT * FROM claims ORDER BY created_at DESC")

    return [
        ClaimRaw(
            id=row["id"],
            name=row["name"],
            ssn_encrypted=row["ssn_encrypted"],
            dob_encrypted=row["dob_encrypted"],
            amount_encrypted=row["amount_encrypted"],
            claim_type=row["claim_type"],
            description=row["description"],
            status=row["status"],
            created_at=row["created_at"],
        )
        for row in rows
    ]


# ------------------------------------------------------------------ #
# Vault status & actions                                               #
# ------------------------------------------------------------------ #


@app.get("/api/vault/status")
async def vault_status():
    try:
        key_info = vault.get_key_info()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"credential": get_cred_info(), "key": key_info, "vault_addr": vault.addr}


@app.post("/api/vault/rotate-key")
async def rotate_key():
    vault.rotate_key()
    return {"message": "Key rotated", "key": vault.get_key_info()}


@app.post("/api/vault/revoke-leases")
async def revoke_leases():
    try:
        vault.revoke_db_leases()
        await refresh_credentials(vault)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"message": "All database leases revoked"}


# ------------------------------------------------------------------ #
# Audit log SSE stream                                                 #
# ------------------------------------------------------------------ #


@app.get("/api/audit/stream")
async def audit_stream(request: Request):
    async def generator() -> AsyncGenerator[str, None]:
        sent = 0
        # Replay buffered events on connect
        snapshot = list(audit_log.events)
        for event in snapshot:
            yield f"data: {json.dumps(event)}\n\n"
        sent = len(snapshot)

        while True:
            if await request.is_disconnected():
                break
            current = list(audit_log.events)
            if len(current) > sent:
                for event in current[sent:]:
                    yield f"data: {json.dumps(event)}\n\n"
                sent = len(current)
            await asyncio.sleep(0.4)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ------------------------------------------------------------------ #
# Serve React build                                                    #
# ------------------------------------------------------------------ #

app.mount("/", StaticFiles(directory="static", html=True), name="static")
