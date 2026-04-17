# src/types

`api.generated.ts` is generated from the backend's `/api/v1/openapi.json`.
**Never hand-edit it.** Instead, change the backend Pydantic schemas /
FastAPI routes, then run:

```bash
cd frontend
pnpm run types:generate
```

CI runs `pnpm run types:check` which regenerates into memory and diffs against
the committed file. If the diff is non-empty, CI fails and asks you to commit
the regenerated file — this guarantees the frontend's API types can never
drift from the backend's OpenAPI spec.
