# SimpleCRM — Claude Code instructions

## UI verification

- After any change that affects rendered UI, use playwright mcp to navigate to the affected route, screenshot it, and check the browser console for errors.
- Iterate until the screenshot matches the intent. Do not claim a UI task is done without a screenshot in the final summary.
- On the first playwright call of a session, invoke it explicitly by name (e.g. "use playwright mcp to navigate to ...") to avoid falling back to bash or other tools.
- Frontend dev server: `pnpm dev` from `frontend/` → http://localhost:5173. Backend: `uv run uvicorn app.main:app --reload --port 8000` → http://localhost:8000. Or `docker compose -f docker-compose.dev.yml up -d` for the full stack.
