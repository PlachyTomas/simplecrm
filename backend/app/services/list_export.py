"""Shared plumbing for the list-view CSV exports (deals, contacts).

Distinct from `services/reports/csv_export.py`, which renders a multi-section
report dashboard. These exports mirror a *list screen*: same filters, same
order, one header row, one row per record.

Conventions are inherited from the existing exports (`api/v1/data_export.py`,
`services/reports/csv_export.py`) and must stay in lockstep with them:
comma-delimited (Python's csv default), every cell formula-escaped via
`SafeCsvWriter`, body prefixed with a UTF-8 BOM so Excel on a Czech Windows
renders diacritics instead of mojibake, and an `attachment` Content-Disposition
carrying a `simplecrm-<entity>-<date>.csv` filename.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from typing import Any

from fastapi.responses import StreamingResponse

from app.core.csv_safety import SafeCsvWriter

# Hard ceiling on a single export. Big enough that no realistic SMB list is
# clipped, small enough that one request can't stream an org's entire history
# through the API process's memory.
EXPORT_ROW_CAP = 5000


def csv_date(value: Any) -> str:
    """`date`/`datetime` → ISO string, NULL → empty cell."""
    return value.isoformat() if value else ""


def csv_response(
    rows: list[list[Any]],
    *,
    filename_stem: str,
    truncated: bool,
) -> StreamingResponse:
    """Serialize `rows` (header row first) into a downloadable CSV response.

    Truncation is surfaced twice — in the filename, which is what the user sees
    once the file lands, and in the `X-Export-Truncated` header for machines.
    """
    buffer = io.StringIO()
    writer = SafeCsvWriter(buffer)
    writer.writerows(rows)

    today = datetime.now(tz=UTC).date().isoformat()
    suffix = f"-first-{EXPORT_ROW_CAP}" if truncated else ""
    filename = f"simplecrm-{filename_stem}-{today}{suffix}.csv"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        # Without the allowlist a cross-origin fetch() (production serves the
        # API from its own host) can't read either header off the response.
        "Access-Control-Expose-Headers": "Content-Disposition, X-Export-Truncated",
    }
    if truncated:
        headers["X-Export-Truncated"] = str(EXPORT_ROW_CAP)

    # UTF-8 BOM — see module docstring.
    return StreamingResponse(
        iter(["﻿" + buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers=headers,
    )
