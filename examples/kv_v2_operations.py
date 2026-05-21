#!/usr/bin/env python3
"""
KV v2: versioned key-value secrets with full history.

KV v2 stores arbitrary key-value maps. Every write creates a new version;
you can read, soft-delete, restore, or permanently destroy specific versions.
Use it for app config, API keys, feature flags, or any secret that changes
infrequently and benefits from an audit trail.

Vault setup:
  vault secrets enable -path=secret kv-v2

Environment:
  export VAULT_ADDR=http://localhost:8200
  export VAULT_TOKEN=<your-token>

Dependencies:
  pip install hvac
"""
import os

import hvac

VAULT_ADDR = os.environ["VAULT_ADDR"]
VAULT_TOKEN = os.environ["VAULT_TOKEN"]
MOUNT = os.getenv("VAULT_KV_MOUNT", "secret")


def write(client: hvac.Client, path: str, data: dict) -> int:
    """Write (or update) a secret. Returns the new version number."""
    result = client.secrets.kv.v2.create_or_update_secret(
        path=path, secret=data, mount_point=MOUNT
    )
    return result["data"]["version"]


def read(client: hvac.Client, path: str, version: int | None = None) -> dict:
    """Read the latest version, or a specific version if provided."""
    result = client.secrets.kv.v2.read_secret_version(
        path=path, version=version, mount_point=MOUNT
    )
    return result["data"]["data"]


def metadata(client: hvac.Client, path: str) -> dict:
    """Read metadata for all versions of a secret."""
    result = client.secrets.kv.v2.read_secret_metadata(path=path, mount_point=MOUNT)
    return result["data"]


def list_keys(client: hvac.Client, path: str = "") -> list[str]:
    """List secret names at a path prefix."""
    result = client.secrets.kv.v2.list_secrets(path=path, mount_point=MOUNT)
    return result["data"]["keys"]


def soft_delete(client: hvac.Client, path: str, versions: list[int]) -> None:
    """Hide specific versions. Data is preserved and can be restored."""
    client.secrets.kv.v2.delete_secret_versions(
        path=path, versions=versions, mount_point=MOUNT
    )


def restore(client: hvac.Client, path: str, versions: list[int]) -> None:
    """Restore soft-deleted versions."""
    client.secrets.kv.v2.undelete_secret_versions(
        path=path, versions=versions, mount_point=MOUNT
    )


def destroy(client: hvac.Client, path: str, versions: list[int]) -> None:
    """Permanently and irreversibly delete specific versions."""
    client.secrets.kv.v2.destroy_secret_versions(
        path=path, versions=versions, mount_point=MOUNT
    )


if __name__ == "__main__":
    client = hvac.Client(url=VAULT_ADDR, token=VAULT_TOKEN)
    path = "myapp/config"

    # --- Write ---
    v1 = write(client, path, {"api_key": "key-abc", "timeout": "30", "env": "staging"})
    print(f"Written version {v1}")

    v2 = write(client, path, {"api_key": "key-xyz", "timeout": "60", "env": "prod"})
    print(f"Updated to version {v2}")

    # --- Read ---
    latest = read(client, path)
    print(f"\nLatest:     {latest}")

    old = read(client, path, version=1)
    print(f"Version 1:  {old}")

    # --- Metadata ---
    meta = metadata(client, path)
    print(f"\nVersions: {list(meta['versions'].keys())}")

    # --- List ---
    keys = list_keys(client, "myapp")
    print(f"Keys under myapp/: {keys}")

    # --- Soft-delete (recoverable) ---
    soft_delete(client, path, versions=[1])
    print("\nSoft-deleted v1")

    restore(client, path, versions=[1])
    print("Restored v1")
    assert read(client, path, version=1) == old

    # --- Permanent destroy ---
    destroy(client, path, versions=[1])
    print("Permanently destroyed v1 (irreversible)")
