# Backend API Structure

## Entry Points
- `main.py`: FastAPI app with route definitions.
- `config.py`: central runtime configuration (paths + environment variables).

## Required Environment Variables
- `OPENAI_API_KEY`: enables OpenAI-based WWR estimation fallback chain.
- `ANTHROPIC_API_KEY`: enables Anthropic-based WWR estimation fallback chain.
- `VT_CLIENT_ID`: Västtrafik OAuth client ID.
- `VT_CLIENT_SECRET`: Västtrafik OAuth client secret.

## Run Locally
From project root:

```powershell
uvicorn backend.main:app --reload --port 8000
```

Health check:

```text
GET http://localhost:8000/api/health
```

## Notes
- Keep secrets out of source code. Use environment variables or a local `.env` workflow.
- `PROJECT_ROOT` and `buildings.json` paths are resolved in `config.py`.
