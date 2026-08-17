#!/usr/bin/env bash
# Daily Boplats refresh for Linux/systemd.
# 1) scrape boplats.se listings into boplats_apartments.db
# 2) regenerate frontend/public/boplats_data.json via boplats_to_assets.py

set -u

PROJECT_ROOT="${PPG_PROJECT_ROOT:-/app}"
PYTHON_BIN="${PPG_PYTHON:-/usr/local/bin/python3}"
LOG_FILE="${PROJECT_ROOT}/tools/boplats_refresh.log"

mkdir -p "$(dirname "$LOG_FILE")"
cd "$PROJECT_ROOT" || exit 2

printf "\n===== %s : boplats refresh start =====\n" "$(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG_FILE"

"$PYTHON_BIN" boplats_scraper.py >> "$LOG_FILE" 2>&1
scrape_exit=$?
"$PYTHON_BIN" boplats_to_assets.py >> "$LOG_FILE" 2>&1
export_exit=$?

printf "===== %s : boplats refresh done (scraper exit %s, exporter exit %s) =====\n" \
  "$(date '+%Y-%m-%d %H:%M:%S')" "$scrape_exit" "$export_exit" >> "$LOG_FILE"

if [[ $scrape_exit -ne 0 || $export_exit -ne 0 ]]; then
  tail_text="$(tail -n 25 "$LOG_FILE" 2>/dev/null || true)"
  body="The Boplats refresh failed at $(date '+%Y-%m-%d %H:%M:%S') (scraper exit $scrape_exit, exporter exit $export_exit)."
  body+=$'\n\nLast log lines:\n'
  body+="$tail_text"
  "$PYTHON_BIN" boplats_notify.py "Boplats refresh FAILED" "$body" >> "$LOG_FILE" 2>&1 || true
  exit 1
fi

exit 0
