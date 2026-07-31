# Daily Boplats pipeline: scrape -> export JSON that the Data Explorer reads.
#
# Design notes (learned the hard way):
#  * We do NOT use `$ErrorActionPreference = "Stop"` across the native python
#    calls. In PS 5.1 that promotes the FIRST stderr line python writes — even a
#    harmless urllib3/deprecation warning — into a terminating error, aborting
#    the run before the exporter ever gets to refresh the JSON. We gate on
#    `$LASTEXITCODE` (the real python exit code) instead.
#  * The exporter ALWAYS runs, even if the scraper failed. The scraper is a
#    network job that can flake; the DB still holds good data, so refreshing the
#    JSON from it keeps the Data Explorer count current instead of frozen.

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonExe = "C:\Users\saraabo\AppData\Local\Programs\Python\Python312\python.exe"
$LogPath = Join-Path $ProjectRoot "logs\boplats_daily.log"

function Write-Log {
    param([string]$Message)
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts $Message" | Out-File -FilePath $LogPath -Append -Encoding utf8
}

Write-Log "=== Daily Boplats run started ==="
Push-Location $ProjectRoot

$scrapeOk = $true
$exportOk = $true

# ── Scrape ────────────────────────────────────────────────────────────────────
Write-Log "Running scraper..."
& $PythonExe "boplats_scraper.py" 2>&1 | Out-File -FilePath $LogPath -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) {
    $scrapeOk = $false
    Write-Log "WARN: boplats_scraper.py exited with code $LASTEXITCODE (continuing to export from existing DB)"
}

# ── Export (ALWAYS, even if the scrape flaked) ────────────────────────────────
Write-Log "Running exporter..."
& $PythonExe "boplats_to_assets.py" 2>&1 | Out-File -FilePath $LogPath -Append -Encoding utf8
if ($LASTEXITCODE -ne 0) {
    $exportOk = $false
    Write-Log "ERROR: boplats_to_assets.py exited with code $LASTEXITCODE"
}

Pop-Location

# ── Alert only if the JSON could not be refreshed, or the scrape failed ────────
if (-not $exportOk -or -not $scrapeOk) {
    $what = if (-not $exportOk) { "EXPORT failed (Data Explorer count is now stale)" } else { "scrape failed (JSON refreshed from existing DB)" }
    Write-Log "Daily Boplats run had problems: $what"
    try {
        $tail = (Get-Content $LogPath -Tail 25 -ErrorAction SilentlyContinue) -join "`n"
        $body = "The boplats DAILY run had a problem at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`n$what`n`nLast log lines:`n$tail"
        & $PythonExe "boplats_notify.py" "Boplats daily pipeline problem" $body 2>&1 | Out-File -FilePath $LogPath -Append -Encoding utf8
    } catch { Write-Log "WARN: alert email step failed: $($_.Exception.Message)" }
} else {
    Write-Log "Daily Boplats run completed successfully."
}

Write-Log "=== Daily Boplats run finished ==="
Write-Log ""
