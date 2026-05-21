#!/usr/bin/env python3
"""
Convergent (deterministic) Transit encryption: searchable encrypted columns.

Standard Transit uses a random IV, so the same plaintext produces a different
ciphertext each call. Convergent mode derives the IV from the plaintext + a
context, so the same inputs always produce the same ciphertext. This lets you
find matching records by comparing ciphertexts — without decrypting anything.

  SELECT * FROM users WHERE ssn_ct = :search_ct

Trade-off: deterministic output leaks whether two records share the same
plaintext value. Use for equality-search columns only; keep a separate
standard-encrypted column for display to avoid frequency analysis.

Vault setup (convergent key requires derived=true):
  vault secrets enable transit
  vault write -force transit/keys/search-key \
    type=aes256-gcm96 \
    convergent_encryption=true \
    derived=true

Environment:
  export VAULT_ADDR=http://localhost:8200
  export VAULT_TOKEN=<your-token>

Dependencies:
  pip install hvac
"""
import base64
import os

import hvac

VAULT_ADDR = os.environ["VAULT_ADDR"]
VAULT_TOKEN = os.environ["VAULT_TOKEN"]
KEY = os.getenv("VAULT_TRANSIT_CONVERGENT_KEY", "search-key")

# Context scopes the key derivation. Must be the same for both encrypt and decrypt.
# Use something stable per-application — changing it makes old ciphertext unreadable.
CONTEXT = base64.b64encode(b"my-app-v1").decode()


def encrypt(client: hvac.Client, plaintext: str) -> str:
    encoded = base64.b64encode(plaintext.encode()).decode()
    result = client.secrets.transit.encrypt_data(
        name=KEY, plaintext=encoded, context=CONTEXT
    )
    return result["data"]["ciphertext"]


def decrypt(client: hvac.Client, ciphertext: str) -> str:
    result = client.secrets.transit.decrypt_data(
        name=KEY, ciphertext=ciphertext, context=CONTEXT
    )
    return base64.b64decode(result["data"]["plaintext"]).decode()


if __name__ == "__main__":
    client = hvac.Client(url=VAULT_ADDR, token=VAULT_TOKEN)

    ssn = "123-45-6789"

    # Two encryptions of the same value → same ciphertext
    ct1 = encrypt(client, ssn)
    ct2 = encrypt(client, ssn)
    assert ct1 == ct2
    print(f"Encrypt twice, same result: {ct1}")

    # Different value → different ciphertext
    ct_other = encrypt(client, "987-65-4321")
    assert ct_other != ct1
    print(f"Different SSN, different ciphertext: {ct_other}")

    # Search pattern: encrypt the search term and compare against stored values
    search_ct = encrypt(client, ssn)
    # In your app: SELECT * FROM claims WHERE ssn_ct = $1
    print(f"\nSearch ciphertext for query: {search_ct}")
    print(f"Matches stored ct1: {search_ct == ct1}")

    # Decryption works normally
    assert decrypt(client, ct1) == ssn
    print(f"\nDecrypted: {decrypt(client, ct1)}")
