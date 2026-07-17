# Backend API Structure

## Entry Points
- `main.py`: FastAPI app with route definitions.
- `config.py`: central runtime configuration (paths + environment variables).

## Required Environment Variables
- `OPENAI_API_KEY`: enables OpenAI-based WWR estimation fallback chain.
- `ANTHROPIC_API_KEY`: enables Anthropic-based WWR estimation fallback chain.
- `VT_CLIENT_ID`: Västtrafik OAuth client ID.
- `VT_CLIENT_SECRET`: Västtrafik OAuth client secret.
- `EPSM_BASE_URL`: EPSM EnergyPlus service base URL (default `http://localhost:8010`).
- `FACADE_MODEL_URL`: facade-defect ML model service base URL (unset by default → `/api/facade-defects` returns a placeholder; see below).

## Connecting the facade-defect ML model (`/api/facade-defects`)

The facade-defect model (classes: crack, leakage, abscission, corrosion, bulge)
is trained separately (see the ML repo). `/api/facade-defects` is wired now but
returns `{"model_connected": false, "defects": []}` until the model is served.

To connect it, wrap the trained checkpoint in a tiny HTTP service exposing:

```
POST /predict
  body:     {"image_base64": "<jpeg/png base64>"}
  response: {"boxes": [[x1,y1,x2,y2], ...], "labels": [1..5], "scores": [0..1],
             "source": "<optional model tag>"}
```

(`labels` are 1-indexed into the class list above — the same contract as the ML
repo's `scripts/demo_app.py`.) Then set `FACADE_MODEL_URL` to that service's base
URL and restart the backend. `/api/facade-defects` will proxy the image, apply
the confidence `threshold`, and return normalized `{class, confidence, box}`
records — no frontend/viewer changes needed (the "Detect Facade Defects" button
in the viewer's Facade Inspector already calls it).

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
