"""CSV import pipeline (companies / combined / separate modes).

The package is split into four layers so each can be tested in isolation:

* :mod:`csv_reader` — parse the raw bytes (BOM strip, encoding sniff,
  size + row caps).
* :mod:`mapping` — validate the user-supplied header→field mapping, then
  turn each :class:`csv.DictReader` row into a typed candidate record
  with per-row validation errors.
* :mod:`matcher` — match contact rows to company rows (or to already
  existing DB companies) using a user-picked key pair.
* :mod:`runner` — orchestrate the above for `preview` and `commit`. The
  two modes share the same parse + match pipeline; only the final DB
  write step differs.
"""

from app.services.imports.csv_reader import (
    MAX_FILE_BYTES,
    MAX_ROWS,
    CsvReadError,
    ParsedCsv,
    parse_csv_bytes,
)
from app.services.imports.mapping import (
    COMPANY_FIELDS,
    CONTACT_FIELDS,
    CandidateCompany,
    CandidateContact,
    MappingError,
    RowError,
    apply_company_mapping,
    apply_contact_mapping,
    validate_mapping,
)
from app.services.imports.matcher import MatcherResult, match_contacts_to_companies
from app.services.imports.owners import (
    OwnerResolutionError,
    OwnerResolver,
    ResolvedOwner,
)
from app.services.imports.runner import (
    ImportInput,
    ImportRunResult,
    run_commit,
    run_preview,
)

__all__ = [
    "COMPANY_FIELDS",
    "CONTACT_FIELDS",
    "MAX_FILE_BYTES",
    "MAX_ROWS",
    "CandidateCompany",
    "CandidateContact",
    "CsvReadError",
    "ImportInput",
    "ImportRunResult",
    "MappingError",
    "MatcherResult",
    "OwnerResolutionError",
    "OwnerResolver",
    "ParsedCsv",
    "ResolvedOwner",
    "RowError",
    "apply_company_mapping",
    "apply_contact_mapping",
    "match_contacts_to_companies",
    "parse_csv_bytes",
    "run_commit",
    "run_preview",
    "validate_mapping",
]
