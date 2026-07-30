# Daily Boplats refresh — run by the "PPG-Boplats-Daily-Refresh" scheduled task.
# 1) scrape the latest boplats.se listings into boplats_apartments.db
# 2) regenerate frontend/public/boplats_data.json (what the app reads)
# The app picks the new JSON up live (it's bind-mounted into the web container),
# so no rebuild is needed — just a browser refresh.
$ErrorActionPreference = 'Continue'
$proj = 'C:\Users\saraabo\Desktop\Project Planning Guide\Project-Planning-Guide'
$py   = 'C:\Users\saraabo\AppData\Local\Programs\Python\Python312\python.exe'
$log  = Join-Path $proj 'tools\boplats_refresh.log'

Set-Location $proj
("`n===== {0} : refresh start =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) | Add-Content $log

& $py boplats_scraper.py   *>> $log ; $scrapeExit = $LASTEXITCODE
& $py boplats_to_assets.py *>> $log ; $exportExit = $LASTEXITCODE

("===== {0} : refresh done (scraper exit {1}, exporter exit {2}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $scrapeExit, $exportExit) | Add-Content $log

if ($scrapeExit -ne 0 -or $exportExit -ne 0) {
    $tail = (Get-Content $log -Tail 25 -ErrorAction SilentlyContinue) -join "`n"
    $body = "The boplats REFRESH run failed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (scraper exit $scrapeExit, exporter exit $exportExit).`n`nLast log lines:`n$tail"
    & $py boplats_notify.py "Boplats refresh FAILED" $body *>> $log
}
