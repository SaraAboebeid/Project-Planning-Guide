# Daily Boplats refresh — run by the "PPG-Boplats-Daily-Refresh" scheduled task.
# 1) scrape the latest boplats.se listings into boplats_apartments.db
# 2) regenerate frontend/public/boplats_data.json (what the app reads)
# The app picks the new JSON up live (it's bind-mounted into the web container),
# so no rebuild is needed — just a browser refresh.
$ErrorActionPreference = 'Continue'
$proj = if ($env:PROJECT_ROOT) {
    $env:PROJECT_ROOT
} elseif ($PSScriptRoot) {
    # This script lives in <root>\tools, so the PROJECT ROOT is one level UP.
    # Using $PSScriptRoot directly silently pointed everything at <root>\tools:
    # the scraper was invoked as tools\boplats_scraper.py (missing), and the log
    # was written to tools\tools\ (a directory that does not exist, so
    # Add-Content simply failed). The scheduled task still exited 0, so the
    # refresh no-opped for weeks without an alert. Do not "simplify" this back.
    Split-Path $PSScriptRoot -Parent
} else {
    (Get-Location).Path
}
$py   = 'C:\Users\saraabo\AppData\Local\Programs\Python\Python312\python.exe'
$log  = Join-Path $proj 'tools\boplats_refresh.log'

Set-Location $proj
# Make the log directory explicit — Add-Content will not create it, and a
# missing directory is how the previous failure stayed invisible.
$logDir = Split-Path $log -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

# Fail loudly if the working directory is not actually the project root.
if (-not (Test-Path (Join-Path $proj 'boplats_scraper.py'))) {
    $msg = "boplats refresh ABORTED: '$proj' is not the project root (boplats_scraper.py not found)."
    ("`n===== {0} : {1} =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) | Add-Content $log
    Write-Error $msg
    exit 2
}
("`n===== {0} : refresh start =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) | Add-Content $log

& $py boplats_scraper.py   *>> $log ; $scrapeExit = $LASTEXITCODE
& $py boplats_to_assets.py *>> $log ; $exportExit = $LASTEXITCODE

("===== {0} : refresh done (scraper exit {1}, exporter exit {2}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $scrapeExit, $exportExit) | Add-Content $log

if ($scrapeExit -ne 0 -or $exportExit -ne 0) {
    $tail = (Get-Content $log -Tail 25 -ErrorAction SilentlyContinue) -join "`n"
    $body = "The boplats REFRESH run failed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (scraper exit $scrapeExit, exporter exit $exportExit).`n`nLast log lines:`n$tail"
    & $py boplats_notify.py "Boplats refresh FAILED" $body *>> $log
}
