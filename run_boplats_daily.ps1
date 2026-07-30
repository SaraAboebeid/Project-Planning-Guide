$ErrorActionPreference = "Stop"

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
try {
    Write-Log "Running scraper..."
    # Merge stderr into stdout so PowerShell does not treat native stderr lines as terminating errors.
    & $PythonExe "boplats_scraper.py" 2>&1 | Out-File -FilePath $LogPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "boplats_scraper.py failed with exit code $LASTEXITCODE"
    }

    Write-Log "Running exporter..."
    # Merge stderr into stdout so PowerShell does not treat native stderr lines as terminating errors.
    & $PythonExe "boplats_to_assets.py" 2>&1 | Out-File -FilePath $LogPath -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "boplats_to_assets.py failed with exit code $LASTEXITCODE"
    }

    Write-Log "Daily Boplats run completed successfully."
}
catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    # Email an alert so a broken pipeline doesn't sit silent for a day.
    try {
        $tail = (Get-Content $LogPath -Tail 25 -ErrorAction SilentlyContinue) -join "`n"
        $body = "The boplats DAILY run failed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss').`n`nError: $($_.Exception.Message)`n`nLast log lines:`n$tail"
        & $PythonExe "boplats_notify.py" "Boplats daily pipeline FAILED" $body 2>&1 | Out-File -FilePath $LogPath -Append -Encoding utf8
    } catch { Write-Log "ERROR: alert email step failed: $($_.Exception.Message)" }
    throw
}
finally {
    Pop-Location
    Write-Log "=== Daily Boplats run finished ==="
    Write-Log ""
}
