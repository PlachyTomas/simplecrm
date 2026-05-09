"""Tax-invoice archival storage.

Two backends, selected by configuration:

  * **Object Storage** (Hetzner / S3-compatible) — production. Activated
    when `settings.s3_endpoint_url` is non-empty. boto3 is lazy-imported
    inside the methods that need it so test runs that don't exercise the
    S3 path stay fast.
  * **Local filesystem** — fallback. Activated when the S3 settings are
    not configured. Writes under `settings.invoice_storage_local_root`
    (default `var/invoices`). Useful for dev and for the "bucket not yet
    provisioned" interim state on a fresh deployment.

The contract is identical regardless of backend:

  * `store_pdf(invoice, bytes)` returns a `StorageResult(object_key,
    sha256, size_bytes)`. The caller (orchestrator, commit #5) writes
    those values onto the `Invoice` row's `pdf_*` columns.
  * `fetch_pdf(invoice)` reads the bytes from storage, computes the
    SHA-256, and compares to the value recorded on the `Invoice` row.
    Mismatch → `IntegrityError` is raised + (in commit #5+) an
    `InvoiceAuditLog(event='integrity_failure', ...)` row is written.

Object key scheme: `invoices/{year}/{customer_org_id}/{number}.pdf`
and `.isdoc.xml`. Customer org ID is in the path so a single bucket
hosts multiple customers without their numbers colliding (numbers are
unique only within the seller's yearly sequence).
"""

from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any

from app.core.config import Settings, get_settings

if TYPE_CHECKING:
    from app.db.models import Invoice

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StorageResult:
    """Outcome of a `store_*` call. The caller persists these onto the
    matching `Invoice.pdf_*` / `Invoice.isdoc_*` columns inside the same
    transaction that flips the invoice to `issued`."""

    object_key: str
    sha256: str
    size_bytes: int


class IntegrityError(RuntimeError):
    """Raised by `fetch_*` when the stored bytes' SHA-256 doesn't match
    the value recorded on the `Invoice` row.

    Carries the expected and actual hashes so the audit-log payload can
    capture both for forensics. Stored bytes are NOT returned — the
    caller cannot trust them.
    """

    def __init__(self, *, object_key: str, expected: str, actual: str) -> None:
        super().__init__(f"Hash mismatch on {object_key!r}: expected {expected}, got {actual}")
        self.object_key = object_key
        self.expected = expected
        self.actual = actual


# --------------------------------------------------------------------------- #
# Object-key helpers
# --------------------------------------------------------------------------- #


def _pdf_object_key(invoice: Invoice) -> str:
    return f"invoices/{invoice.year}/{invoice.organization_id}/{invoice.number}.pdf"


def _isdoc_object_key(invoice: Invoice) -> str:
    return f"invoices/{invoice.year}/{invoice.organization_id}/{invoice.number}.isdoc.xml"


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# --------------------------------------------------------------------------- #
# InvoiceStorage
# --------------------------------------------------------------------------- #


class InvoiceStorage:
    """Stateless wrapper. Construct per-request or reuse — both are safe.

    The S3 client is lazy-built on first use (and cached on the instance)
    so import time stays cheap and test runs that never touch S3 don't
    pay for boto3.
    """

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        # boto3 client; left as Any so mypy doesn't flag the
        # `is not None` lazy-init check as unreachable.
        self._s3_client: Any = None
        self._warned_local_fallback = False

    # ------------------------- backend selection ------------------------- #

    @property
    def _use_s3(self) -> bool:
        return bool(self._settings.s3_endpoint_url and self._settings.s3_bucket_invoices)

    def _get_s3(self) -> Any:
        """Lazy boto3 client. Hetzner Object Storage requires
        `addressing_style="path"` in the S3 config because virtual-hosted
        URLs (the AWS default) don't resolve against non-AWS endpoints."""
        if self._s3_client is not None:
            return self._s3_client
        import boto3
        from botocore.config import Config

        self._s3_client = boto3.client(
            "s3",
            endpoint_url=self._settings.s3_endpoint_url,
            aws_access_key_id=self._settings.s3_access_key_id,
            aws_secret_access_key=self._settings.s3_secret_access_key,
            region_name=self._settings.s3_region,
            config=Config(s3={"addressing_style": "path"}, signature_version="s3v4"),
        )
        return self._s3_client

    def _local_path(self, object_key: str) -> Path:
        return Path(self._settings.invoice_storage_local_root) / object_key

    # ------------------------- store ------------------------------------ #

    def store_pdf(self, invoice: Invoice, pdf_bytes: bytes) -> StorageResult:
        return self._store(_pdf_object_key(invoice), pdf_bytes, content_type="application/pdf")

    def store_isdoc(self, invoice: Invoice, xml_bytes: bytes) -> StorageResult:
        return self._store(_isdoc_object_key(invoice), xml_bytes, content_type="application/xml")

    def _store(self, object_key: str, data: bytes, *, content_type: str) -> StorageResult:
        digest = _sha256(data)
        size = len(data)

        if self._use_s3:
            client = self._get_s3()
            # Storing the SHA-256 as object metadata gives the bucket
            # itself a way to flag tampering even if the DB row is lost.
            client.put_object(
                Bucket=self._settings.s3_bucket_invoices,
                Key=object_key,
                Body=data,
                ContentType=content_type,
                Metadata={"sha256": digest},
            )
        else:
            if not self._warned_local_fallback:
                logger.warning(
                    "InvoiceStorage: S3 not configured; using local fallback at %s",
                    self._settings.invoice_storage_local_root,
                )
                self._warned_local_fallback = True
            path = self._local_path(object_key)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        return StorageResult(object_key=object_key, sha256=digest, size_bytes=size)

    # ------------------------- fetch ------------------------------------ #

    def fetch_pdf(self, invoice: Invoice) -> bytes:
        if invoice.pdf_object_key is None or invoice.pdf_sha256 is None:
            raise FileNotFoundError(
                f"Invoice {invoice.number} has no stored PDF (pdf_object_key is NULL)"
            )
        return self._fetch(invoice.pdf_object_key, invoice.pdf_sha256)

    def fetch_isdoc(self, invoice: Invoice) -> bytes:
        if invoice.isdoc_object_key is None or invoice.isdoc_sha256 is None:
            raise FileNotFoundError(
                f"Invoice {invoice.number} has no stored ISDOC (isdoc_object_key is NULL)"
            )
        return self._fetch(invoice.isdoc_object_key, invoice.isdoc_sha256)

    def _fetch(self, object_key: str, expected_sha256: str) -> bytes:
        if self._use_s3:
            client = self._get_s3()
            response = client.get_object(Bucket=self._settings.s3_bucket_invoices, Key=object_key)
            data: bytes = response["Body"].read()
        else:
            path = self._local_path(object_key)
            if not path.exists():
                raise FileNotFoundError(f"Local invoice storage missing: {path}")
            data = path.read_bytes()

        actual = _sha256(data)
        if actual != expected_sha256:
            raise IntegrityError(object_key=object_key, expected=expected_sha256, actual=actual)
        return data


__all__ = ["IntegrityError", "InvoiceStorage", "StorageResult"]
