# Nakama Just Dance — Realistic k6 Load Test

## Load model (corrected — 1:1 TV-to-mobile)

**One k6 VU = one complete game session = 1 TV + 1 mobile player.**

| Profile | Launcher | k6 VUs | TV | Mobile | Total clients |
|---------|----------|--------|-----|--------|---------------|
| **10-user smoke** | `run-10.bat` | 5 | 5 | 5 | 10 |
| **50-user load** | `run-50.bat` | 25 | 25 | 25 | 50 |
| **100-user stress** | `run-100.bat` | 50 | 50 | 50 | 100 |

`MOBILE_PLAYERS` must equal `TV_SESSIONS`. The test validates this at startup.

### Device IDs (unique per VU, stable for session)

Each VU creates a `sessionKey` and derives:

| Role | ID format |
|------|-----------|
| TV auth | `tv-k6-{sessionKey}` |
| TV pairing/link | `tv-k6{sessionKey}-{timestamp}` (matches server regex) |
| Mobile auth | `mobile-k6-{sessionKey}` |

TV auth ID and TV link ID are **always different** (production requirement).

## Recommended execution order

1. **`run-10.bat`** — 5 VUs, full 60s gameplay. Must pass before step 2.
2. **`run-50.bat`** — 25 VUs, production load.
3. **`run-100.bat`** — 50 VUs, stress test (only if step 2 is stable).

## Per-VU lifecycle

```
1 TV auth + 1 mobile auth
→ pairing (generateLinkLoginCode + verifyAndAccept)
→ video notifications (9, 6, 10) + VideoUnityReady (11)
→ TV WebSocket open
→ rpc_generateSyncStartAt + ~10s countdown
→ 60s gameplay: scores (code 8) + frame sync pulses + getServerTime
→ final result (code 13 + rpc_dance_submitSessionResults)
→ cleanup (SessionEnded + unlink)
```

## Quick start

```bat
copy .env.example .env
rem Set NAKAMA_SERVER_KEY in .env

run-10.bat
run-50.bat
run-100.bat
```

## Environment variables

| Variable | Description |
|----------|-------------|
| `MOBILE_PLAYERS` | Mobile player count (= k6 VUs for gameplay) |
| `TV_SESSIONS` | TV session count (must equal MOBILE_PLAYERS) |
| `NAKAMA_SERVER_KEY` | Socket server key for device auth |
| `COUNTDOWN_MS` | Sync countdown (default 10000) |
| `VIDEO_DURATION_MS` | Gameplay duration (default 60000) |

Legacy `TOTAL_PLAYERS` / `PLAYERS_PER_SESSION` are removed — use `MOBILE_PLAYERS` + `TV_SESSIONS`.

## Expected peak traffic (all sessions in gameplay, 1:1 model)

| Profile | Score msg/sec | Frame-sync pulse/sec |
|---------|---------------|----------------------|
| 10-user (5 VUs) | ~5 | ~40 |
| 50-user (25 VUs) | ~25 | ~200 |
| 100-user (50 VUs) | ~50 | ~400 |

Per session: TV + 1 mobile each pulse frame sync (~8/sec combined), mobile sends ~1 score/sec.

## Outputs

Same summary format for all profiles: `summary.json`, `results.json`, console summary with `loadProfile` tag for comparing 10 vs 50 vs 100 runs.
