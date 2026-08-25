#!/usr/bin/env bash
# Optional server resource monitor — run on the Nakama host during k6 tests.
# Usage: ./monitor-nakama.sh [interval_seconds] [output_file]

set -euo pipefail

INTERVAL="${1:-5}"
OUTPUT="${2:-nakama-monitor.log}"
NAKAMA_CONTAINER="${NAKAMA_CONTAINER:-nakama-just-dance}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-postgres}"

echo "# Nakama monitor started $(date -Is) interval=${INTERVAL}s" | tee -a "$OUTPUT"

while true; do
  TS="$(date -Is)"
  {
    echo "=== $TS ==="

    if command -v docker >/dev/null 2>&1; then
      echo "-- docker stats (one-shot) --"
      docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}" \
        "$NAKAMA_CONTAINER" "$POSTGRES_CONTAINER" 2>/dev/null || true
    fi

    echo "-- load / memory / disk --"
    uptime 2>/dev/null || true
    free -h 2>/dev/null || true

    if command -v vmstat >/dev/null 2>&1; then
      echo "-- vmstat --"
      vmstat 1 2 2>/dev/null | tail -n 1 || true
    fi

    if command -v iostat >/dev/null 2>&1; then
      echo "-- iostat --"
      iostat -x 1 2 2>/dev/null | tail -n +4 || true
    fi

    if command -v ss >/dev/null 2>&1; then
      echo "-- socket summary (7350) --"
      ss -s 2>/dev/null || true
      ss -Htan "sport = :7350" 2>/dev/null | wc -l | awk '{print "connections_on_7350=" $1}'
    fi

    echo ""
  } >> "$OUTPUT"

  sleep "$INTERVAL"
done
