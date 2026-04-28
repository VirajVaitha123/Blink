# Serverless functions

Placeholder for Azure Functions (or other serverless workloads). Add a function by:

1. `mkdir backend/functions/my-function`
2. Create `pyproject.toml` with hatchling build, depending on `blink_shared`:
   ```toml
   [tool.uv.sources]
   blink_shared = { workspace = true }
   ```
3. Add `"functions/my-function"` to `members` in `backend/pyproject.toml`.
4. `cd backend && uv sync`.
