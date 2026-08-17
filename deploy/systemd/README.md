# Linux Scheduled Tasks (systemd)

This folder contains Linux-native scheduled task setup for:
- Booli weekly refresh
- Boplats daily refresh

## Files

- `ppg-booli-refresh.service`
- `ppg-booli-refresh.timer`
- `ppg-boplats-refresh.service`
- `ppg-boplats-refresh.timer`
- Runtime scripts in `tools/refresh_booli.sh` and `tools/refresh_boplats.sh`

## Prerequisites

- Project available at `/app`
- Python available at `/usr/local/bin/python3`
- Required runtime env vars available in `/app/.env` (if needed for Apify/SMTP)

## Install

```bash
sudo cp deploy/systemd/ppg-booli-refresh.service /etc/systemd/system/
sudo cp deploy/systemd/ppg-booli-refresh.timer /etc/systemd/system/
sudo cp deploy/systemd/ppg-boplats-refresh.service /etc/systemd/system/
sudo cp deploy/systemd/ppg-boplats-refresh.timer /etc/systemd/system/

sudo chmod +x /app/tools/refresh_booli.sh /app/tools/refresh_boplats.sh

sudo systemctl daemon-reload
sudo systemctl enable --now ppg-booli-refresh.timer
sudo systemctl enable --now ppg-boplats-refresh.timer
```

## Verify

```bash
systemctl list-timers --all | grep ppg-
systemctl status ppg-booli-refresh.timer
systemctl status ppg-boplats-refresh.timer
```

## Run once manually

```bash
sudo systemctl start ppg-booli-refresh.service
sudo systemctl start ppg-boplats-refresh.service
```

## Logs

- `/app/tools/booli_refresh.log`
- `/app/tools/boplats_refresh.log`
- `journalctl -u ppg-booli-refresh.service`
- `journalctl -u ppg-boplats-refresh.service`
