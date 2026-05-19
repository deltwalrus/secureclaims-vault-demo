import datetime
import logging
from collections import deque
from typing import Any

logger = logging.getLogger(__name__)


class AuditLog:
    """
    In-memory ring buffer of Vault operation events, streamed to the UI via SSE.

    In production you would also write these events to a persistent store
    (file, database, SIEM). Vault itself has a server-side audit device that
    logs every API call — enable it with:
        vault audit enable file file_path=/vault/logs/audit.log
    """

    def __init__(self, maxlen: int = 200) -> None:
        self.events: deque[dict] = deque(maxlen=maxlen)

    def add(
        self,
        operation: str,
        path: str,
        status: str,
        extra: dict[str, Any] | None = None,
    ) -> dict:
        event = {
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
            "operation": operation,
            "path": path,
            "status": status,
            "extra": extra or {},
        }
        self.events.append(event)
        logger.debug("vault-op operation=%s path=%s status=%s", operation, path, status)
        return event


audit_log = AuditLog()
