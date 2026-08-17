# Start the facade defect-detection ML service on the host.
# It loads the trained model from C:\Users\saraabo\Desktop\ML using your torch
# env and serves on :8020. The app's Docker backend proxies /api/facade-detect
# to it via host.docker.internal:8020, so this must be running for the "Defects"
# button in the Facade Inspector to work. Keep this window open (or run it as a
# scheduled/background task).
$proj = if ($env:PROJECT_ROOT) {
    $env:PROJECT_ROOT
} elseif ($PSScriptRoot) {
    $PSScriptRoot
} else {
    (Get-Location).Path
}
Set-Location $proj
# Uses whichever `python` has torch installed (the one you trained the model with).
python tools\ml\facade_detect_service.py
