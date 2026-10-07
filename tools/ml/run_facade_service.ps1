# Start the facade defect-detection ML service on the host.
# It loads the trained model from C:\Users\saraabo\Desktop\ML using your torch
# env and serves on :8021. The app's backend proxies /api/facade-detect to it
# (via localhost, or host.docker.internal:8021 from Docker), so this must be
# running for defect detection to use the ML model - otherwise the Step 2 panel
# falls back to the AI vision model alone and says so. Keep this window open (or
# run it as a scheduled/background task).
$proj = if ($env:PROJECT_ROOT) {
    $env:PROJECT_ROOT
} elseif ($PSScriptRoot) {
    Split-Path (Split-Path $PSScriptRoot)
} else {
    (Get-Location).Path
}
Set-Location $proj
# The ML repo's own environment has torch (+ fastapi/uvicorn installed into it).
$py = "C:\Users\saraabo\Desktop\ML\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { $py = "python" }
& $py tools\ml\facade_detect_service.py
