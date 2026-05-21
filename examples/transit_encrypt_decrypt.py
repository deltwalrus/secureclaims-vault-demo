#!/usr/bin/env python3
"""
Transit Encrypt-as-a-Service: encrypt, decrypt, rotate, rewrap.

The Transit engine is a cryptography-as-a-service API. Your app sends plaintext,
Vault returns ciphertext. The key never leaves Vault. After key rotation, old
ciphertext still decrypts (Vault reads the version from the vault:vN: prefix);
rewrap re-encrypts old ciphertext under the latest key without your app ever
seeing the plaintext.

Vault setup (run once):
  vault secrets enable transit
  vault write -force transit/keys/my-key type=aes256-gcm96

Environment:
  export VAULT_ADDR=http://localhost:8200
  export VAULT_TOKEN=<your-token>
  export VAULT_TRANSIT_KEY=my-key   # optional, defaults to my-key

Dependencies:
  pip install hvac
"""
import base64
import os

import hvac

VAULT_ADDR = os.environ["VAULT_ADDR"]
VAULT_TOKEN = os.environ["VAULT_TOKEN"]
KEY = os.getenv("VAULT_TRANSIT_KEY", "my-key")


def get_client() -> hvac.Client:
    client = hvac.Client(url=VAULT_ADDR)
    client.token = VAULT_TOKEN
    assert client.is_authenticated(), "Vault auth failed — check VAULT_ADDR and VAULT_TOKEN"
    return client


def encrypt(client: hvac.Client, plaintext: str) -> str:
    encoded = base64.b64encode(plaintext.encode()).decode()
    result = client.secrets.transit.encrypt_data(name=KEY, plaintext=encoded)
    return result["data"]["ciphertext"]   # vault:v1:...


def decrypt(client: hvac.Client, ciphertext: str) -> str:
    result = client.secrets.transit.decrypt_data(name=KEY, ciphertext=ciphertext)
    return base64.b64decode(result["data"]["plaintext"]).decode()


def rotate_key(client: hvac.Client) -> int:
    """Bump the key version. Future encryptions use the new version."""
    client.secrets.transit.rotate_key(name=KEY)
    info = client.secrets.transit.read_key(name=KEY)
    return info["data"]["latest_version"]


def rewrap(client: hvac.Client, ciphertext: str) -> str:
    """Re-encrypt ciphertext under the latest key version without decrypting it."""
    result = client.secrets.transit.rewrap_data(name=KEY, ciphertext=ciphertext)
    return result["data"]["ciphertext"]


if __name__ == "__main__":
    client = get_client()

    # --- Basic round-trip ---
    ssn = "123-45-6789"
    ct = encrypt(client, ssn)
    print(f"Encrypted:  {ct}")

    pt = decrypt(client, ct)
    assert pt == ssn
    print(f"Decrypted:  {pt}")

    # --- Key rotation ---
    version = rotate_key(client)
    print(f"\nKey rotated → v{version}")

    # Old ciphertext still decrypts after rotation
    pt_after = decrypt(client, ct)
    assert pt_after == ssn
    print(f"Old ciphertext still decrypts: {pt_after}")

    # New encryptions use the latest version
    ct_new = encrypt(client, ssn)
    print(f"New ciphertext (v{version}): {ct_new}")

    # --- Rewrap ---
    # Rewrap brings old ciphertext up to the current key version without
    # the app ever touching the plaintext. Good for key hygiene migrations.
    ct_rewrapped = rewrap(client, ct)
    assert ct_rewrapped != ct
    assert decrypt(client, ct_rewrapped) == ssn
    print(f"\nRewrapped:  {ct_rewrapped}")
    print("Rewrap verified — same plaintext, current key version.")
