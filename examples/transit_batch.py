#!/usr/bin/env python3
"""
Transit batch encryption: encrypt/decrypt multiple fields in one API call.

One round-trip for N fields is far more efficient than N separate calls.
Each item is encrypted independently (separate IVs, separate ciphertexts),
so this is purely a throughput optimization, not a security trade-off.

Vault setup:
  vault secrets enable transit
  vault write -force transit/keys/my-key type=aes256-gcm96

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
KEY = os.getenv("VAULT_TRANSIT_KEY", "my-key")


def batch_encrypt(client: hvac.Client, fields: dict[str, str]) -> dict[str, str]:
    """Encrypt multiple values in one call. Returns {field_name: ciphertext}."""
    names = list(fields.keys())
    batch_input = [
        {"plaintext": base64.b64encode(fields[k].encode()).decode()}
        for k in names
    ]
    result = client.secrets.transit.encrypt_data(name=KEY, batch_input=batch_input)
    ciphertexts = [item["ciphertext"] for item in result["data"]["batch_results"]]
    return dict(zip(names, ciphertexts))


def batch_decrypt(client: hvac.Client, fields: dict[str, str]) -> dict[str, str]:
    """Decrypt multiple ciphertexts in one call. Returns {field_name: plaintext}."""
    names = list(fields.keys())
    batch_input = [{"ciphertext": fields[k]} for k in names]
    result = client.secrets.transit.decrypt_data(name=KEY, batch_input=batch_input)
    plaintexts = [
        base64.b64decode(item["plaintext"]).decode()
        for item in result["data"]["batch_results"]
    ]
    return dict(zip(names, plaintexts))


if __name__ == "__main__":
    client = hvac.Client(url=VAULT_ADDR, token=VAULT_TOKEN)

    # Encrypt an entire record's PII fields in one API call
    pii = {
        "ssn":   "123-45-6789",
        "dob":   "1985-03-22",
        "phone": "555-867-5309",
        "email": "alice@example.com",
    }

    encrypted = batch_encrypt(client, pii)
    print("Encrypted (1 API call):")
    for field, ct in encrypted.items():
        print(f"  {field}: {ct}")

    decrypted = batch_decrypt(client, encrypted)
    print("\nDecrypted (1 API call):")
    for field, pt in decrypted.items():
        print(f"  {field}: {pt}")

    assert decrypted == pii
    print("\nRound-trip verified.")
