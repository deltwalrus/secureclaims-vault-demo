# SecureClaims — Vault Integration Reference

A working FastAPI + React application that demonstrates how to integrate HashiCorp Vault into a real app. The scenario is an insurance claims processor that handles PII, but the patterns apply to any service that needs to protect sensitive data or manage database credentials.

**What this shows:**

- Encrypting and decrypting sensitive fields (SSN, DOB, amounts) via the Transit engine
- Obtaining short-lived database credentials on startup instead of storing a password
- Reading application secrets from KV v2
- Revoking all active credentials and immediately recovering — zero downtime

## Quick start

Prerequisites: Docker and Docker Compose.

```bash
git clone https://github.com/deltwalrus/secureclaims-vault-demo
cd secureclaims-vault-demo
docker compose up --build
```

Open [http://localhost:8000](http://localhost:8000). Vault, PostgreSQL, and the app all start together. The `vault-setup` container configures everything automatically.

## The Vault patterns

### Transit encryption

The app never stores plaintext PII. Before writing to the database, each sensitive field is sent to Vault's Transit engine, which returns a ciphertext like `vault:v1:AbCd...`. The key material never leaves Vault.

```python
# app/vault_client.py
def encrypt(self, plaintext: str) -> str:
    encoded = base64.b64encode(plaintext.encode()).decode()
    result = self.client.secrets.transit.encrypt_data(name=TRANSIT_KEY, plaintext=encoded)
    return result["data"]["ciphertext"]   # vault:v1:...

def decrypt(self, ciphertext: str) -> str:
    result = self.client.secrets.transit.decrypt_data(name=TRANSIT_KEY, ciphertext=ciphertext)
    return base64.b64decode(result["data"]["plaintext"]).decode()
```

**Key rotation** — click "Rotate Key" in the UI. Vault creates a new key version; new encryptions use it. Old ciphertext still decrypts — Vault reads the version from the `vault:vN:` prefix and selects the right key automatically. Toggle "Peek Raw DB" to see what the database actually stores.

### Dynamic database credentials

The app never has a database password in its config. On startup it asks Vault for a credential, Vault creates a PostgreSQL user with a TTL, and the app uses it. When the TTL approaches, the app requests a new one. The old user is dropped automatically.

```python
# app/vault_client.py
def get_db_credentials(self) -> tuple[str, str, int, str]:
    result = self.client.secrets.database.generate_credentials(name=DB_ROLE)
    return (
        result["data"]["username"],   # v-<auth-method>-<role>-<random>
        result["data"]["password"],
        result["lease_duration"],     # seconds
        result["lease_id"],
    )
```

```python
# app/database.py — the app rotates before TTL expires
async def _credential_refresher(vault) -> None:
    while True:
        ttl = _cred_info.get("ttl", 300)
        await asyncio.sleep(ttl * 0.75)   # refresh at 75% of TTL
        try:
            await _refresh_credentials(vault)
        except Exception as exc:
            logger.error("Credential refresh failed: %s", exc)
            await asyncio.sleep(15)       # back off and retry
```

Click "Revoke All Leases" in the UI to force-revoke every active credential instantly. The app detects the broken connection and requests a fresh one — watch the credential panel update and the audit log record both the revocation and the new lease.

### KV v2 for static secrets

Admin credentials that the app needs exactly once (to create the schema) live in Vault KV rather than environment variables. KV v2 keeps a full version history and supports fine-grained policies.

```python
# app/database.py
admin = vault.read_secret("claims-app/db-init")
# returns: {"host": "...", "port": "...", "database": "...", "username": "...", "password": "..."}
```

Write the secret once during setup:

```bash
vault kv put secret/claims-app/db-init \
  host=mydb.example.com port=5432 database=claims \
  username=adminuser password=adminpass
```

### Auth

For local development the app uses a Vault token (`VAULT_TOKEN`). In production on AWS, swap to IAM auth — the IAM role becomes the identity and no long-lived credentials are needed:

```python
# app/vault_client.py — _authenticate_iam()
self.client.auth.aws.iam_login(
    access_key=creds.access_key,
    secret_key=creds.secret_key,
    session_token=creds.token,
    role=aws_role,
    mount_point=auth_path,   # defaults to "aws"; set VAULT_AWS_AUTH_PATH to override
)
```

Set `VAULT_AWS_ROLE` and unset `VAULT_TOKEN` to activate this path.

## Using Vault from other languages

Vault exposes a plain HTTP API, so any language works. The patterns below mirror the Python examples — pick whichever fits your stack.

### Go

```go
// go get github.com/hashicorp/vault/api
package main

import (
    "context"
    "encoding/base64"
    "fmt"

    vault "github.com/hashicorp/vault/api"
)

func main() {
    // VAULT_ADDR and VAULT_TOKEN are read from the environment automatically.
    client, _ := vault.NewClient(vault.DefaultConfig())

    // Transit: encrypt
    encoded := base64.StdEncoding.EncodeToString([]byte("123-45-6789"))
    enc, _ := client.Logical().Write("transit/encrypt/my-key",
        map[string]interface{}{"plaintext": encoded})
    ciphertext := enc.Data["ciphertext"].(string)

    // Transit: decrypt
    dec, _ := client.Logical().Write("transit/decrypt/my-key",
        map[string]interface{}{"ciphertext": ciphertext})
    raw, _ := base64.StdEncoding.DecodeString(dec.Data["plaintext"].(string))
    fmt.Println(string(raw)) // 123-45-6789

    // KV v2: the KVv2 helper unwraps the data.data nesting for you
    secret, _ := client.KVv2("secret").Get(context.Background(), "myapp/config")
    fmt.Println(secret.Data["api_key"])

    // Dynamic DB credentials
    creds, _ := client.Logical().Read("database/creds/my-app-role")
    fmt.Printf("user=%s ttl=%ds\n", creds.Data["username"], creds.LeaseDuration)
}
```

### Node.js / TypeScript

No SDK required — Node 18+ ships with `fetch`. Deno and Bun work identically.

```typescript
const VAULT_ADDR  = process.env.VAULT_ADDR!
const VAULT_TOKEN = process.env.VAULT_TOKEN!

async function vault(method: string, path: string, body?: object) {
    const res = await fetch(`${VAULT_ADDR}/v1/${path}`, {
        method,
        headers: { 'X-Vault-Token': VAULT_TOKEN, 'Content-Type': 'application/json' },
        ...(body && { body: JSON.stringify(body) }),
    })
    if (!res.ok) throw new Error(await res.text())
    return res.json()
}

// Transit: encrypt / decrypt
const plaintext = Buffer.from('123-45-6789').toString('base64')
const { data: { ciphertext } } = await vault('POST', 'transit/encrypt/my-key', { plaintext })
const { data: { plaintext: pt64 } } = await vault('POST', 'transit/decrypt/my-key', { ciphertext })
console.log(Buffer.from(pt64, 'base64').toString())   // 123-45-6789

// KV v2: note the data.data nesting in the raw response
const { data: { data: secret } } = await vault('GET', 'secret/data/myapp/config')
console.log(secret.api_key)

// Dynamic DB credentials
const dbResp = await vault('GET', 'database/creds/my-app-role')
const { username, password } = dbResp.data
console.log(`user=${username} ttl=${dbResp.lease_duration}s`)
```

### Ruby

Uses only stdlib — no gem needed.

```ruby
require 'net/http'
require 'json'
require 'base64'

VAULT_ADDR  = ENV['VAULT_ADDR']
VAULT_TOKEN = ENV['VAULT_TOKEN']

def vault(method, path, body = nil)
    uri  = URI("#{VAULT_ADDR}/v1/#{path}")
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == 'https'
    req = (method == :get ? Net::HTTP::Get : Net::HTTP::Post).new(uri)
    req['X-Vault-Token'] = VAULT_TOKEN
    req['Content-Type']  = 'application/json'
    req.body = body.to_json if body
    JSON.parse(http.request(req).body)
end

# Transit: encrypt / decrypt
encoded    = Base64.strict_encode64('123-45-6789')
ciphertext = vault(:post, 'transit/encrypt/my-key', { plaintext: encoded }).dig('data', 'ciphertext')
pt64       = vault(:post, 'transit/decrypt/my-key', { ciphertext: ciphertext }).dig('data', 'plaintext')
puts Base64.strict_decode64(pt64)   # 123-45-6789

# KV v2: two levels of data nesting
secret = vault(:get, 'secret/data/myapp/config').dig('data', 'data')
puts secret['api_key']

# Dynamic DB credentials
db = vault(:get, 'database/creds/my-app-role')
puts "user=#{db.dig('data', 'username')} ttl=#{db['lease_duration']}s"
```

## Standalone examples

The [`examples/`](examples/) directory has self-contained scripts you can run against any Vault server — copy them into your own project as a starting point.

| Script | What it covers |
| --- | --- |
| [`transit_encrypt_decrypt.py`](examples/transit_encrypt_decrypt.py) | Encrypt, decrypt, rotate key, rewrap ciphertext |
| [`transit_batch.py`](examples/transit_batch.py) | Batch encrypt/decrypt multiple fields in one call |
| [`transit_convergent.py`](examples/transit_convergent.py) | Deterministic encryption for searchable columns |
| [`kv_v2_operations.py`](examples/kv_v2_operations.py) | Read/write secrets, version history, soft-delete |
| [`dynamic_db_creds.py`](examples/dynamic_db_creds.py) | Dynamic Postgres creds, lease renewal, background refresh |
| [`curl_examples.sh`](examples/curl_examples.sh) | Same patterns via raw HTTP — works from any language |

```bash
cd examples && pip install -r requirements.txt
python transit_encrypt_decrypt.py
```

## Project structure

```text
app/
  vault_client.py   # all Vault calls — start here
  database.py       # credential lifecycle management
  audit.py          # in-memory event log, streamed to the UI via SSE
  main.py           # FastAPI routes
  models.py         # Pydantic schemas
  seed.py           # sample data
  frontend/         # React + TypeScript + Tailwind

vault-setup/
  setup.sh          # one-shot Vault configuration script
  policy.hcl        # least-privilege policy for the app token
```

## Running against an existing Vault server

If you have Vault already running:

```bash
export VAULT_ADDR=https://vault.example.com
export VAULT_TOKEN=<your-token>
export DB_ADMIN_PASSWORD=<your-db-admin-password>

sh vault-setup/setup.sh   # idempotent; skip if already configured

# Then run only the app:
docker compose up app postgres
```

Or run the app directly:

```bash
cd app
pip install -r requirements.txt
export VAULT_ADDR=http://localhost:8200
export VAULT_TOKEN=dev-root-token
export DB_HOST=localhost DB_PORT=5432 DB_NAME=claims DB_SSL=disable
uvicorn main:app --reload
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `VAULT_ADDR` | yes | — | Vault server URL |
| `VAULT_TOKEN` | yes* | — | Token auth (local dev) |
| `VAULT_AWS_ROLE` | yes* | — | IAM auth role name (AWS) |
| `DB_HOST` | yes | — | PostgreSQL hostname |
| `DB_PORT` | no | `5432` | PostgreSQL port |
| `DB_NAME` | yes | — | Database name |
| `DB_SSL` | no | `require` | `require` or `disable` |
| `VAULT_TRANSIT_KEY` | no | `claims-pii` | Transit key name |
| `VAULT_DB_ROLE` | no | `claims-app-role` | Database role name |
| `VAULT_KV_MOUNT` | no | `secret` | KV v2 mount path |

\* One of `VAULT_TOKEN` or `VAULT_AWS_ROLE` is required.
