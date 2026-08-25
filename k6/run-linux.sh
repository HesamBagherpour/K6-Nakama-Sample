#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/../.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/../.env"
  set +a
fi

: "${NAKAMA_SERVER_KEY:=${NAKAMA_HTTP_KEY:-}}"
if [[ -z "$NAKAMA_SERVER_KEY" ]]; then
  echo "ERROR: Set NAKAMA_SERVER_KEY (device auth / socket.server_key)" >&2
  exit 1
fi

export LOAD_PROFILE="${LOAD_PROFILE:-load}"
export SCENARIO="${SCENARIO:-gameplay}"

case "$LOAD_PROFILE" in
  smoke)
    export MOBILE_PLAYERS="${MOBILE_PLAYERS:-5}"
    export TV_SESSIONS="${TV_SESSIONS:-5}"
    export RAMP_UP="${RAMP_UP:-15s}"
    export RAMP_DOWN="${RAMP_DOWN:-10s}"
    ;;
  stress)
    export MOBILE_PLAYERS="${MOBILE_PLAYERS:-50}"
    export TV_SESSIONS="${TV_SESSIONS:-50}"
    export RAMP_UP="${RAMP_UP:-60s}"
    export RAMP_DOWN="${RAMP_DOWN:-15s}"
    ;;
  *)
    export MOBILE_PLAYERS="${MOBILE_PLAYERS:-25}"
    export TV_SESSIONS="${TV_SESSIONS:-25}"
    export RAMP_UP="${RAMP_UP:-30s}"
    export RAMP_DOWN="${RAMP_DOWN:-10s}"
    ;;
esac

export COUNTDOWN_MS="${COUNTDOWN_MS:-10000}"
export VIDEO_DURATION_MS="${VIDEO_DURATION_MS:-60000}"
export SCORE_INTERVAL_MS="${SCORE_INTERVAL_MS:-1000}"
export FRAME_SYNC_INTERVAL_MS="${FRAME_SYNC_INTERVAL_MS:-250}"
export NAKAMA_HOST="${NAKAMA_HOST:-85.198.11.216}"
export NAKAMA_PORT="${NAKAMA_PORT:-7350}"

exec k6 run "$ROOT/nakama-load-test.js"
