import base64
import logging
import os

import urllib3
import hvac

from audit import audit_log

logger = logging.getLogger(__name__)

TRANSIT_KEY = os.getenv("VAULT_TRANSIT_KEY", "claims-pii")
TRANSIT_KEY_CONVERGENT = os.getenv("VAULT_TRANSIT_KEY_CONVERGENT", "claims-pii-convergent")
CONVERGENT_CONTEXT = base64.b64encode(b"claims-app").decode()
DB_ROLE = os.getenv("VAULT_DB_ROLE", "claims-app-role")
KV_MOUNT = os.getenv("VAULT_KV_MOUNT", "secret")


class VaultClient:
    """
    Thin wrapper around the hvac client covering the four Vault patterns used
    by this demo: token auth, KV v2, Transit encryption, and dynamic DB creds.

    Auth strategy (checked in order):
      1. VAULT_TOKEN env var  — simplest; use Vault's dev server locally
      2. AWS IAM              — for production on AWS; see _authenticate_iam()

    TLS: set VAULT_SKIP_VERIFY=true to disable certificate verification (useful
    when Vault uses a self-signed cert in a dev/lab environment).
    """

    def __init__(self) -> None:
        self.addr = os.environ["VAULT_ADDR"]

        skip_verify = os.getenv("VAULT_SKIP_VERIFY", "").lower() in ("true", "1", "yes")
        if skip_verify:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        self.client = hvac.Client(url=self.addr, verify=not skip_verify)

        vault_token = os.getenv("VAULT_TOKEN")
        if vault_token:
            self.client.token = vault_token
            audit_log.add("auth/token", "direct", "SUCCESS")
        else:
            self._authenticate_iam()

    # ------------------------------------------------------------------ #
    # Auth                                                                 #
    # ------------------------------------------------------------------ #

    def _authenticate_iam(self) -> None:
        """
        AWS IAM auth: the app signs a GetCallerIdentity request with its IAM
        credentials and presents it to Vault. Vault verifies with AWS STS and
        issues a token. No long-lived secrets needed — the IAM role IS the identity.

        Requires: boto3, an AWS IAM role bound to the Vault role, and the
        `aws` auth method enabled at the path configured by VAULT_AWS_AUTH_PATH.

        See: https://developer.hashicorp.com/vault/docs/auth/aws
        """
        import boto3
        aws_role = os.environ["VAULT_AWS_ROLE"]
        auth_path = os.getenv("VAULT_AWS_AUTH_PATH", "aws")
        session = boto3.Session()
        creds = session.get_credentials().get_frozen_credentials()
        self.client.auth.aws.iam_login(
            access_key=creds.access_key,
            secret_key=creds.secret_key,
            session_token=creds.token,
            role=aws_role,
            mount_point=auth_path,
        )
        audit_log.add("auth/aws/iam", aws_role, "SUCCESS", extra={"method": "sts:GetCallerIdentity"})

    def _ensure_auth(self) -> None:
        try:
            if not self.client.is_authenticated():
                self._authenticate_iam()
        except Exception:
            self._authenticate_iam()

    # ------------------------------------------------------------------ #
    # KV v2                                                                #
    # ------------------------------------------------------------------ #

    def read_secret(self, path: str) -> dict:
        """
        Read a secret from KV v2. The mount is configurable via VAULT_KV_MOUNT.

        KV v2 keeps a full version history of every secret. This is used here
        to store the database admin credentials so they never touch app env vars.

        Vault API: GET /v1/{mount}/data/{path}
        """
        self._ensure_auth()
        result = self.client.secrets.kv.v2.read_secret_version(
            path=path, mount_point=KV_MOUNT
        )
        audit_log.add("secret/data/read", path, "SUCCESS")
        return result["data"]["data"]

    # ------------------------------------------------------------------ #
    # Transit (encrypt-as-a-service)                                       #
    # ------------------------------------------------------------------ #

    def encrypt(self, plaintext: str, field: str | None = None, convergent: bool = False) -> str:
        """
        Encrypt plaintext with the Transit engine. The app never holds the key —
        only Vault does. The returned ciphertext (vault:vN:... or CONV:vault:vN:...)
        is safe to store in the database.

        Standard mode: each call produces a unique ciphertext even for identical
        plaintext (random IV per encryption).

        Convergent mode: same plaintext + same context always produces the same
        ciphertext. Useful for searchable encryption (compare ciphertexts to find
        matching records), at the cost of some information leakage. The key must
        be created with convergent_encryption=true and derived=true.

        Vault API: POST /v1/transit/encrypt/{key}
        """
        self._ensure_auth()
        encoded = base64.b64encode(plaintext.encode()).decode()

        if convergent:
            result = self.client.secrets.transit.encrypt_data(
                name=TRANSIT_KEY_CONVERGENT,
                plaintext=encoded,
                context=CONVERGENT_CONTEXT,
            )
            ciphertext = "CONV:" + result["data"]["ciphertext"]
        else:
            result = self.client.secrets.transit.encrypt_data(
                name=TRANSIT_KEY,
                plaintext=encoded,
            )
            ciphertext = result["data"]["ciphertext"]

        extra: dict = {}
        if field:
            extra["field"] = field
        if convergent:
            extra["convergent"] = True
        audit_log.add("transit/encrypt", TRANSIT_KEY_CONVERGENT if convergent else TRANSIT_KEY, "SUCCESS", extra=extra or None)
        return ciphertext

    def decrypt(self, ciphertext: str, _log: bool = True) -> str:
        """
        Decrypt a vault:vN:... or CONV:vault:vN:... ciphertext.

        The CONV: prefix indicates the convergent key was used; decrypt routes
        to the correct key automatically. Vault handles key version routing for
        rotation — old ciphertexts still decrypt after key rotation.

        Vault API: POST /v1/transit/decrypt/{key}
        """
        self._ensure_auth()

        if ciphertext.startswith("CONV:"):
            result = self.client.secrets.transit.decrypt_data(
                name=TRANSIT_KEY_CONVERGENT,
                ciphertext=ciphertext[5:],
                context=CONVERGENT_CONTEXT,
            )
        else:
            result = self.client.secrets.transit.decrypt_data(
                name=TRANSIT_KEY,
                ciphertext=ciphertext,
            )

        plaintext = base64.b64decode(result["data"]["plaintext"]).decode()
        if _log:
            audit_log.add("transit/decrypt", TRANSIT_KEY, "SUCCESS")
        return plaintext

    def get_key_info(self) -> dict:
        self._ensure_auth()
        result = self.client.secrets.transit.read_key(name=TRANSIT_KEY)
        data = result["data"]
        return {
            "name": TRANSIT_KEY,
            "type": data["type"],
            "latest_version": data["latest_version"],
            "min_decryption_version": data["min_decryption_version"],
        }

    def rotate_key(self) -> None:
        """
        Rotate the Transit key. A new key version is created; future encryptions
        use it. Existing ciphertext can still be decrypted with older versions
        (down to min_decryption_version). Use rewrap to re-encrypt old data.

        Vault API: POST /v1/transit/keys/{key}/rotate
        """
        self._ensure_auth()
        self.client.secrets.transit.rotate_key(name=TRANSIT_KEY)
        result = self.client.secrets.transit.read_key(name=TRANSIT_KEY)
        version = result["data"]["latest_version"]
        audit_log.add("transit/keys/rotate", TRANSIT_KEY, "SUCCESS", extra={"version": version})

    # ------------------------------------------------------------------ #
    # Dynamic database credentials                                         #
    # ------------------------------------------------------------------ #

    def get_db_credentials(self) -> tuple[str, str, int, str]:
        """
        Request a short-lived PostgreSQL username and password from Vault.
        Vault creates the user directly in the database with a TTL; when the
        lease expires Vault drops the user. The app never manages DB users.

        Vault API: GET /v1/database/creds/{role}
        Returns: (username, password, ttl_seconds, lease_id)
        """
        self._ensure_auth()
        result = self.client.secrets.database.generate_credentials(name=DB_ROLE)
        username: str = result["data"]["username"]
        password: str = result["data"]["password"]
        ttl: int = result["lease_duration"]
        lease_id: str = result["lease_id"]
        audit_log.add(
            "database/creds",
            DB_ROLE,
            "SUCCESS",
            extra={"username": username, "ttl": ttl},
        )
        return username, password, ttl, lease_id

    def revoke_db_leases(self) -> None:
        """
        Force-revoke all active leases under the DB role prefix. Vault immediately
        drops every database user it created under this role. The app detects the
        broken connection and requests fresh credentials.

        Requires the `sudo` capability on sys/leases/revoke-force/... in policy.
        Vault API: PUT /v1/sys/leases/revoke-force/{prefix}
        """
        self._ensure_auth()
        self.client.sys.revoke_force(prefix=f"database/creds/{DB_ROLE}")
        audit_log.add("sys/leases/revoke-force", f"database/creds/{DB_ROLE}", "SUCCESS")
