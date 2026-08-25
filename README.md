# K6-Nakama-Sample

k6 load tests for the Nakama Just Dance backend.

## Load model

**One k6 VU = one complete game session = 1 TV + 1 mobile player.**

Load class is the **configured VU level**. It is not a server-health verdict.

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

`run-smoke.bat` is 1 VU (1 TV + 1 mobile) and is not a LIGHT/MEDIUM/HEAVY run.

Each TV has unique device IDs. Each mobile has a unique device ID. The TV authentication device ID is different from the TV pairing/link device ID.

---

## Windows quick start

The launchers **automatically load `.env`**. You do not need to run `set NAKAMA_SERVER_KEY=...` (or any other `set`) before each test.

### STEP 1

Copy `.env.example` to `.env`

```bat
copy .env.example .env
```

### STEP 2

Edit `.env` and fill in the real values:

- `NAKAMA_HOST`
- `NAKAMA_PORT`
- `NAKAMA_SERVER_KEY` (Nakama **socket server key** used by `POST /v2/account/authenticate/device`)

`NAKAMA_HTTP_KEY` is optional for these scenarios. Do not put the HTTP key in `NAKAMA_SERVER_KEY`.

### STEP 3

Current phase — run **LIGHT only**:

```bat
run-10.bat
```

That is **10 VU LIGHT** (10 TV + 10 mobile = 20 clients).

`run-50.bat` (25 VU MEDIUM) and `run-100.bat` (50 VU HEAVY) are configured but exit with **CONFIGURED BUT NOT RUN** unless `ALLOW_HIGHER_LOAD=1` is set after that load is explicitly requested.

Optional: `run-smoke.bat` is a 1 VU config check (not a load class).

---

## What the launchers do

Each `run-*.bat` file:

1. Finds the project `.env`
2. Loads it (skips blank lines and `#` comments)
3. Validates required variables and rejects placeholders
4. Applies the profile (VU counts, timings, load class)
5. Starts k6 with those environment variables (LIGHT only in this phase)

k6 reads configuration from `__ENV`. Secrets stay in `.env`, not in JavaScript source.

`.env` is gitignored. Never commit real keys.

---

## Errors

| Message | What to do |
|---------|------------|
| `ERROR: .env file not found.` | Copy `.env.example` to `.env` |
| `ERROR: NAKAMA_SERVER_KEY is missing from .env.` | Add `NAKAMA_SERVER_KEY=` with the socket server key |
| `ERROR: NAKAMA_SERVER_KEY is still a placeholder.` | Replace `your_socket_server_key_here` with the real key |
| `ERROR: k6 executable was not found.` | Install k6 and add it to PATH |
| `CONFIGURED BUT NOT RUN` | MEDIUM/HEAVY are blocked in this phase |

Launchers never print secret values.

---

## More detail

See `k6/README.md` for the per-VU lifecycle, metrics, and expected traffic.
