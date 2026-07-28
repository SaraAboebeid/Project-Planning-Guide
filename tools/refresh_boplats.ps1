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

& $py boplats_scraper.py   *>> $log
& $py boplats_to_assets.py *>> $log

("===== {0} : refresh done (exit {1}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $LASTEXITCODE) | Add-Content $log
