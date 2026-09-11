# Weekly Booli refresh — run by the "PPG-Booli-Weekly" scheduled task.
#   1) scrape sold / for-sale / coming listings via the Apify actor into
#      booli_listings.db (accumulates — keeps history of what's new each week)
#   2) regenerate frontend/public/booli_data.json (what the Data Explorer reads;
#      served live via the bind-mounted web container — just refresh the browser).
# Weekly cadence is kept to stay polite to booli.se, not for cost: booli_scraper.py
# is now a DIRECT scraper reading the page's __NEXT_DATA__ payload, with no paid
# Apify actor involved (the old header here still claimed one).
# Emails saraabo@chalmers.se on failure (reuses boplats_notify.py; needs SMTP in .env).
$ErrorActionPreference = 'Continue'
# The Docker refactor put CONTAINER paths ('/app', '/usr/local/bin/python3') into
# this PowerShell script, which cannot run on Windows at all. Those belong in
# refresh_booli.sh, which already handles them via PPG_PROJECT_ROOT/PPG_PYTHON.
$proj = if ($env:PROJECT_ROOT) {
    $env:PROJECT_ROOT
} elseif ($PSScriptRoot) {
    Split-Path $PSScriptRoot -Parent   # this script lives in <root>\tools
} else {
    (Get-Location).Path
}
$py   = 'C:\Users\saraabo\AppData\Local\Programs\Python\Python312\python.exe'
$log  = Join-Path $proj 'tools\booli_refresh.log'

Set-Location $proj
$logDir = Split-Path $log -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

if (-not (Test-Path (Join-Path $proj 'booli_scraper.py'))) {
    $msg = "booli refresh ABORTED: '$proj' is not the project root (booli_scraper.py not found)."
    ("`n===== {0} : {1} =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg) | Add-Content $log
    Write-Error $msg
    exit 2
}
("`n===== {0} : booli weekly refresh start =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) | Add-Content $log

& $py booli_scraper.py    *>> $log ; $scrapeExit = $LASTEXITCODE
& $py booli_to_assets.py  *>> $log ; $exportExit = $LASTEXITCODE

("===== {0} : booli refresh done (scraper exit {1}, exporter exit {2}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $scrapeExit, $exportExit) | Add-Content $log

if ($scrapeExit -ne 0 -or $exportExit -ne 0) {
    $tail = (Get-Content $log -Tail 25 -ErrorAction SilentlyContinue) -join "`n"
    $body = "The weekly BOOLI scrape failed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (scraper exit $scrapeExit, exporter exit $exportExit).`n`nLast log lines:`n$tail"
    & $py boplats_notify.py "Booli weekly scrape FAILED" $body *>> $log
}
