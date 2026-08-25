# Nakama Just Dance — Realistic k6 Load Test

## Load model

**One k6 VU = one complete game session = 1 TV + 1 mobile player.**

Load class is the **configured VU level**. It does not describe server health.

| VUs | Load Level | TV Sessions | Mobile | Total Clients | Launcher | This phase |
|-----|------------|-------------|--------|---------------|----------|------------|
| 10 | **LIGHT** | 10 | 10 | 20 | `run-10.bat` | **EXECUTE** |
| 25 | **MEDIUM** | 25 | 25 | 50 | `run-50.bat` | Configured but not run |
| 50 | **HEAVY** | 50 | 50 | 100 | `run-100.bat` | Configured but not run |

```
+---------+-------------+-------------+---------------+--------------+
| VUs     | Load Level  | TV Sessions | Mobile        | Total Clients|
+---------+-------------+-------------+---------------+--------------+
| 10      | LIGHT       | 10          | 10            | 20           |
| 25      | MEDIUM      | 25          | 25            | 50           |
| 50      | HEAVY       | 50          | 50            | 100          |
+---------+-------------+-------------+---------------+--------------+
```

`run-smoke.bat` is 1 VU (1 TV + 1 mobile). It is a config check, not LIGHT/MEDIUM/HEAVY.

`MOBILE_PLAYERS` must equal `TV_SESSIONS`. The test validates this at startup.

MEDIUM and HEAVY launchers refuse to start unless `ALLOW_HIGHER_LOAD=1` is set **and** that load is explicitly requested.

### Device IDs (unique per VU, stable for session)

Each VU creates a `sessionKey` and derives:

| Role | ID format |
|------|-----------|
| TV auth | `tv-k6-{sessionKey}` |
| TV pairing/link | `tv-k6{sessionKey}-{timestamp}` (matches server regex) |
| Mobile auth | `mobile-k6-{sessionKey}` |

TV auth ID and TV link ID are **always different** (production requirement).

## Recommended execution order

Launchers automatically load the project `.env`. Do not set keys by hand in the shell.

0. **`run-smoke.bat`** — 1 VU, optional config check.
1. **`run-10.bat`** — **10 VU LIGHT** (10 TV + 10 mobile = 20 clients). Current phase.
2. **`run-50.bat`** — 25 VU MEDIUM. Configured but not run in this phase.
3. **`run-100.bat`** — 50 VU HEAVY. Configured but not run in this phase.

## Per-VU lifecycle

```
1 TV auth + 1 mobile auth
→ pairing (generateLinkLoginCode + verifyAndAccept)
→ video notifications (9, 6, 10) + VideoUnityReady (11)
→ TV WebSocket open
→ rpc_generateSyncStartAt + ~10s countdown
→ 60s gameplay: scores (code 8) + frame sync pulses + getServerTime
→ gameplay finished (code 13 OnDanceVideoFinished) — no leaderboard write
→ cleanup (SessionEnded + unlink)
```

## Quick start

```bat
copy .env.example .env
rem Edit .env: NAKAMA_HOST, NAKAMA_PORT, NAKAMA_SERVER_KEY

run-10.bat
```

Do not run `run-50.bat` or `run-100.bat` until LIGHT is requested to be followed by MEDIUM/HEAVY.

The launchers load `.env` for you. You do not need `set NAKAMA_SERVER_KEY=...` before running.

## Environment variables

| Variable | Description |
|----------|-------------|
| `MOBILE_PLAYERS` | Mobile player count (= k6 VUs for gameplay) |
| `TV_SESSIONS` | TV session count (must equal MOBILE_PLAYERS) |
| `NAKAMA_SERVER_KEY` | Socket server key for device auth |
| `COUNTDOWN_MS` | Sync countdown (default 10000) |
| `VIDEO_DURATION_MS` | Gameplay duration (default 60000) |
| `ALLOW_HIGHER_LOAD` | Must be `1` to run MEDIUM/HEAVY; do not set unless requested |

## Expected peak traffic (all sessions in gameplay, 1:1 model)

| Load Level | VUs | Score msg/sec | Frame-sync pulse/sec |
|------------|-----|---------------|----------------------|
| LIGHT | 10 | ~10 | ~80 |
| MEDIUM | 25 | ~25 | ~200 |
| HEAVY | 50 | ~50 | ~400 |

Per session: TV + 1 mobile each pulse frame sync (~8/sec combined), mobile sends ~1 score/sec.

## Outputs

Every summary starts with:

```
NAKAMA LOAD LEVEL
VU Level / Load Class / TV Sessions / Mobile Players / Total Clients
```

Load class is always one of **LIGHT**, **MEDIUM**, **HEAVY** when VU count is 10/25/50. Files: `summary.json`, `results.json`, console summary.
