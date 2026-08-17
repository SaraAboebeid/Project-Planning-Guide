# Weekly Booli refresh — run by the "PPG-Booli-Weekly" scheduled task.
#   1) scrape sold / for-sale / coming listings via the Apify actor into
#      booli_listings.db (accumulates — keeps history of what's new each week)
#   2) regenerate frontend/public/booli_data.json (what the Data Explorer reads;
#      served live via the bind-mounted web container — just refresh the browser).
# NOTE: the Apify actor is PAID — this is scheduled WEEKLY on purpose. Emails
# saraabo@chalmers.se on failure (reuses boplats_notify.py; needs SMTP in .env).
$ErrorActionPreference = 'Continue'
$proj = '/app'
$py   = '/usr/local/bin/python3'
$log  = Join-Path $proj 'tools\booli_refresh.log'

Set-Location $proj
("`n===== {0} : booli weekly refresh start =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) | Add-Content $log

& $py booli_scraper.py    *>> $log ; $scrapeExit = $LASTEXITCODE
& $py booli_to_assets.py  *>> $log ; $exportExit = $LASTEXITCODE

("===== {0} : booli refresh done (scraper exit {1}, exporter exit {2}) =====" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $scrapeExit, $exportExit) | Add-Content $log

if ($scrapeExit -ne 0 -or $exportExit -ne 0) {
    $tail = (Get-Content $log -Tail 25 -ErrorAction SilentlyContinue) -join "`n"
    $body = "The weekly BOOLI scrape failed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') (scraper exit $scrapeExit, exporter exit $exportExit).`n`nLast log lines:`n$tail"
    & $py boplats_notify.py "Booli weekly scrape FAILED" $body *>> $log
}
