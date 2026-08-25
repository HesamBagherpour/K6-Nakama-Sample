#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

ENV_FILE="$(cd "$ROOT/.." && pwd)/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: .env file not found." >&2
  echo "Create it from .env.example." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

is_placeholder() {
  case "${1:-}" in
    your_socket_server_key_here|your_http_key_here|YOUR_KEY|CHANGE_ME|changeme) return 0 ;;
    *) return 1 ;;
  esac
}

if [[ -z "${NAKAMA_HOST:-}" ]]; then
  echo "ERROR: NAKAMA_HOST is missing from .env." >&2
  exit 1
fi
if [[ -z "${NAKAMA_PORT:-}" ]]; then
  echo "ERROR: NAKAMA_PORT is missing from .env." >&2
  exit 1
fi
if [[ -z "${NAKAMA_SERVER_KEY:-}" ]]; then
  echo "ERROR: NAKAMA_SERVER_KEY is missing from .env." >&2
  exit 1
fi
if is_placeholder "$NAKAMA_SERVER_KEY"; then
  echo "ERROR: NAKAMA_SERVER_KEY is still a placeholder." >&2
  echo "Please edit .env." >&2
  exit 1
fi
if [[ -n "${NAKAMA_HTTP_KEY:-}" ]] && is_placeholder "$NAKAMA_HTTP_KEY"; then
  echo "ERROR: NAKAMA_HTTP_KEY is still a placeholder." >&2
  echo "Please edit .env." >&2
  exit 1
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "ERROR: k6 executable was not found." >&2
  exit 1
fi

export LOAD_PROFILE="${LOAD_PROFILE:-light}"
export SCENARIO="${SCENARIO:-gameplay}"

case "$LOAD_PROFILE" in
  smoke)
    export MOBILE_PLAYERS="${MOBILE_PLAYERS:-1}"
    export TV_SESSIONS="${TV_SESSIONS:-1}"
    export RAMP_UP="${RAMP_UP:-1s}"
    export RAMP_DOWN="${RAMP_DOWN:-1s}"
    ;;
  medium|load)
    export MOBILE_PLAYERS="${MOBILE_PLAYERS:-25}"
    export TV_SESSIONS="${TV_SESSIONS:-25}"
    export RAMP_UP="${RAMP_UP:-30s}"
    export RAMP_DOWN="${RAMP_DOWN:-10s}"
    ;;
  heavy|stress)
    export MOBILE_PLAYERS="${MOBILE_PLAYERS:-50}"
    export TV_SESSIONS="${TV_SESSIONS:-50}"
    export RAMP_UP="${RAMP_UP:-60s}"
    export RAMP_DOWN="${RAMP_DOWN:-15s}"
    ;;
  *)
    export MOBILE_PLAYERS="${MOBILE_PLAYERS:-10}"
    export TV_SESSIONS="${TV_SESSIONS:-10}"
    export RAMP_UP="${RAMP_UP:-15s}"
    export RAMP_DOWN="${RAMP_DOWN:-10s}"
    ;;
esac

if [[ "${TV_SESSIONS}" -gt 10 && "${ALLOW_HIGHER_LOAD:-}" != "1" ]]; then
  echo "ERROR: This phase only executes 10 VU LIGHT." >&2
  echo "25 VU MEDIUM and 50 VU HEAVY are configured but not run." >&2
  exit 1
fi

export COUNTDOWN_MS="${COUNTDOWN_MS:-10000}"
export VIDEO_DURATION_MS="${VIDEO_DURATION_MS:-60000}"
export SCORE_INTERVAL_MS="${SCORE_INTERVAL_MS:-1000}"
export FRAME_SYNC_INTERVAL_MS="${FRAME_SYNC_INTERVAL_MS:-250}"

echo "Loaded .env"
echo "NAKAMA_HOST=${NAKAMA_HOST}"
echo "NAKAMA_PORT=${NAKAMA_PORT}"
echo "NAKAMA_SERVER_KEY is set."

exec k6 run "$ROOT/nakama-load-test.js"
