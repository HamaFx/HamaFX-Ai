#!/usr/bin/env bash
# infra/cron-vm/setup.sh — Bootstrap the hamafx-cron GCE VM.
#
# This script is idempotent: re-running it updates the cron schedule and
# env without breaking anything.
#
# What it installs:
#   - curl (for HTTP cron calls)
#   - /opt/hamafx/cron-fire.sh (the script cron invokes)
#   - /opt/hamafx/.env (CRON_SECRET + PRODUCTION_URL)
#   - System crontab entries at the correct cadences
#   - Logrotate for /var/log/hamafx-cron.log
#
# Usage (from your local machine):
#   gcloud compute scp infra/cron-vm/setup.sh hamafx-cron:/tmp/setup.sh --zone=us-central1-a
#   gcloud compute ssh hamafx-cron --zone=us-central1-a --command="sudo bash /tmp/setup.sh"

set -euo pipefail

echo "[hamafx-cron] Installing dependencies..."
apt-get update -qq
apt-get install -y -qq curl cron logrotate

echo "[hamafx-cron] Creating /opt/hamafx..."
mkdir -p /opt/hamafx

echo "[hamafx-cron] Writing cron-fire.sh..."
cat > /opt/hamafx/cron-fire.sh << 'SCRIPT'
#!/usr/bin/env bash
# Fires a single cron endpoint. Called by system crontab.
# Usage: /opt/hamafx/cron-fire.sh <endpoint-path>
# Example: /opt/hamafx/cron-fire.sh /api/cron/news
set -euo pipefail

ENDPOINT="${1:?Usage: cron-fire.sh /api/cron/<name>}"
source /opt/hamafx/.env

URL="${PRODUCTION_URL}${ENDPOINT}"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

HTTP_CODE=$(curl -fsS -m 55 -o /tmp/cron-response.txt -w "%{http_code}" \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "$URL" 2>/tmp/cron-error.txt || true)

if [ "$HTTP_CODE" = "200" ]; then
  echo "${TIMESTAMP} OK ${ENDPOINT} $(cat /tmp/cron-response.txt | head -c 200)"
else
  echo "${TIMESTAMP} FAIL ${ENDPOINT} HTTP=${HTTP_CODE} $(cat /tmp/cron-error.txt | head -c 200)"
fi
SCRIPT
chmod +x /opt/hamafx/cron-fire.sh

echo "[hamafx-cron] Writing logrotate config..."
cat > /etc/logrotate.d/hamafx-cron << 'LOGROTATE'
/var/log/hamafx-cron.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0644 root root
}
LOGROTATE

echo "[hamafx-cron] Installing crontab..."
# Remove any existing hamafx entries
crontab -l 2>/dev/null | grep -v 'hamafx' | crontab - 2>/dev/null || true

# Write the full schedule
cat > /tmp/hamafx-crontab << 'CRONTAB'
# HamaFX-Ai cron schedule — managed by infra/cron-vm/setup.sh
# Logs: /var/log/hamafx-cron.log
#
# ┌─── minute
# │  ┌─── hour
# │  │  ┌─── day of month
# │  │  │ ┌─── month
# │  │  │ │ ┌─── day of week
# │  │  │ │ │

# News ingestion — every 5 minutes
*/5 * * * * /opt/hamafx/cron-fire.sh /api/cron/news >> /var/log/hamafx-cron.log 2>&1

# Calendar ingestion — every 15 minutes
*/15 * * * * /opt/hamafx/cron-fire.sh /api/cron/calendar >> /var/log/hamafx-cron.log 2>&1

# Alert evaluation — every 5 minutes
*/5 * * * * /opt/hamafx/cron-fire.sh /api/cron/alerts >> /var/log/hamafx-cron.log 2>&1

# Briefings (pre/post event) — every 5 minutes
*/5 * * * * /opt/hamafx/cron-fire.sh /api/cron/briefings >> /var/log/hamafx-cron.log 2>&1

# Daily snapshot — 00:05 UTC
5 0 * * * /opt/hamafx/cron-fire.sh /api/cron/snapshots >> /var/log/hamafx-cron.log 2>&1

# Embedding backfill — every 6 hours
15 */6 * * * /opt/hamafx/cron-fire.sh /api/cron/embedding-backfill >> /var/log/hamafx-cron.log 2>&1

# FRED actuals backfill — 01:30 UTC daily
30 1 * * * /opt/hamafx/cron-fire.sh /api/cron/fred-actuals >> /var/log/hamafx-cron.log 2>&1

# Weekly review — Sunday 18:00 UTC
0 18 * * 0 /opt/hamafx/cron-fire.sh /api/cron/weekly-review >> /var/log/hamafx-cron.log 2>&1

# CFTC CoT — Friday 22:00 UTC
0 22 * * 5 /opt/hamafx/cron-fire.sh /api/cron/cot >> /var/log/hamafx-cron.log 2>&1
CRONTAB

crontab /tmp/hamafx-crontab
rm /tmp/hamafx-crontab

echo "[hamafx-cron] Ensuring cron service is running..."
systemctl enable cron
systemctl restart cron

echo "[hamafx-cron] Done. Verify with: crontab -l"
echo "[hamafx-cron] Logs at: /var/log/hamafx-cron.log"
echo "[hamafx-cron] IMPORTANT: Write /opt/hamafx/.env with CRON_SECRET and PRODUCTION_URL"
