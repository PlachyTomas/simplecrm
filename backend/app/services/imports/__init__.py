"""CSV import pipeline (companies / combined / separate modes).

The package is split into four layers so each can be tested in isolation:

* :mod:`csv_reader` — parse the raw bytes (BOM strip, encoding sniff,
  size + row caps).
* :mod:`mapping` — validate the user-supplied header→field mapping, then
  turn each :class:`csv.DictReader` row into a typed candidate record
  with per-row validation errors.
* :mod:`matcher` — match contact rows to company rows (or to already
  existing DB companies) using a user-picked key pair.
* :mod:`stages` — the deal status/stage semantics (a lost deal keeps an
  open-type stage; `closed_at` comes from the status word, not the stage).
* :mod:`providers` — declarative per-CRM profiles (header aliases, role
  detection). The engine itself stays provider-agnostic.
* :mod:`runner` — orchestrate the above for `preview` and `commit`. The
  two modes share the same parse + match pipeline; only the final DB
  write step differs.
* :mod:`undo` — delete what one committed run created, skipping anything
  that has been worked on since.
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
    DEAL_FIELDS,
    NOTE_APPEND,
    CandidateCompany,
    CandidateContact,
    CandidateDeal,
    MappingError,
    RowError,
    apply_company_mapping,
    apply_contact_mapping,
    apply_deal_mapping,
    validate_mapping,
)
from app.services.imports.matcher import (
    MatcherResult,
    match_contacts_to_companies,
    normalize_match_key,
)
from app.services.imports.owners import (
    OwnerResolutionError,
    OwnerResolver,
    ResolvedOwner,
)
from app.services.imports.providers import (
    PROVIDERS,
    ProviderProfile,
    get_provider,
)
from app.services.imports.runner import (
    ImportInput,
    ImportRunResult,
    run_commit,
    run_preview,
)
from app.services.imports.stages import (
    StageInfo,
    StageResolver,
    load_stages,
    suggest_stage_mapping,
)
from app.services.imports.undo import (
    UndoResult,
    UndoSkip,
    undo_import_run,
    updates_not_reverted,
)

__all__ = [
    "COMPANY_FIELDS",
    "CONTACT_FIELDS",
    "DEAL_FIELDS",
    "MAX_FILE_BYTES",
    "MAX_ROWS",
    "NOTE_APPEND",
    "PROVIDERS",
    "CandidateCompany",
    "CandidateContact",
    "CandidateDeal",
    "CsvReadError",
    "ImportInput",
    "ImportRunResult",
    "MappingError",
    "MatcherResult",
    "OwnerResolutionError",
    "OwnerResolver",
    "ParsedCsv",
    "ProviderProfile",
    "ResolvedOwner",
    "RowError",
    "StageInfo",
    "StageResolver",
    "UndoResult",
    "UndoSkip",
    "apply_company_mapping",
    "apply_contact_mapping",
    "apply_deal_mapping",
    "get_provider",
    "load_stages",
    "match_contacts_to_companies",
    "normalize_match_key",
    "parse_csv_bytes",
    "run_commit",
    "run_preview",
    "suggest_stage_mapping",
    "undo_import_run",
    "updates_not_reverted",
    "validate_mapping",
]
