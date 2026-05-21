# Examples

Standalone scripts demonstrating each Vault pattern. Each one runs against
any Vault server — dev mode, Docker Compose from this repo, or production.

```bash
# Start a local Vault dev server (no persistence, fine for testing)
vault server -dev -dev-root-token-id=dev-root-token &

export VAULT_ADDR=http://127.0.0.1:8200
export VAULT_TOKEN=dev-root-token

pip install -r requirements.txt
```

| File | Pattern | What it shows |
|---|---|---|
| [transit_encrypt_decrypt.py](transit_encrypt_decrypt.py) | Transit EaaS | Encrypt/decrypt PII, rotate the key, rewrap old ciphertext |
| [transit_batch.py](transit_batch.py) | Transit EaaS | Encrypt/decrypt multiple fields in one API call |
| [transit_convergent.py](transit_convergent.py) | Transit EaaS | Deterministic (searchable) encryption |
| [kv_v2_operations.py](kv_v2_operations.py) | KV v2 | Write, read, list, version history, soft-delete, restore, destroy |
| [dynamic_db_creds.py](dynamic_db_creds.py) | Dynamic secrets | Postgres creds on demand, lease renewal, background refresh loop |
| [curl_examples.sh](curl_examples.sh) | Raw HTTP API | Same patterns via curl — copy into any language |

## Running an example

```bash
# Transit round-trip
python transit_encrypt_decrypt.py

# Batch encryption
python transit_batch.py

# Searchable encryption (requires a convergent key — see script header)
python transit_convergent.py

# Dynamic DB creds (requires Vault database engine configured — see script header)
python dynamic_db_creds.py

# KV v2
python kv_v2_operations.py

# curl / HTTP API
bash curl_examples.sh
```

Each script prints its Vault setup commands at the top. The `vault server -dev`
flag enables all secrets engines on localhost with no TLS — sufficient for
exploring the API, not for production.
