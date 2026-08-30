@echo off
setlocal EnableExtensions

title Nakama Load Test - 100 CCU (50 VU HEAVY)

set "ROOT=%~dp0"
cd /d "%ROOT%"

rem ---------------------------------------------------------------------------
rem 1. Load .env (NAKAMA_SERVER_KEY required for device auth)
rem ---------------------------------------------------------------------------
call "%ROOT%load-env.bat"
if errorlevel 1 (
  echo.
  echo PRE-FLIGHT FAILED: .env could not be loaded.
  exit /b 1
)

rem ---------------------------------------------------------------------------
rem 2. HEAVY profile — 50 VU = 50 TV + 50 mobile = 100 concurrent clients
rem ---------------------------------------------------------------------------
set "ALLOW_HIGHER_LOAD=1"
set "NAKAMA_HOST=85.198.11.216"
set "NAKAMA_PORT=7350"
set "LOAD_PROFILE=heavy"
set "SCENARIO=gameplay"
set "TV_SESSIONS=50"
set "MOBILE_PLAYERS=50"
set "COUNTDOWN_MS=10000"
set "VIDEO_DURATION_MS=60000"
set "SCORE_INTERVAL_MS=1000"
set "FRAME_SYNC_INTERVAL_MS=250"
set "RAMP_UP=60s"
set "RAMP_DOWN=15s"

rem ---------------------------------------------------------------------------
rem 3. Pre-flight: tooling
rem ---------------------------------------------------------------------------
where k6 >nul 2>&1
if errorlevel 1 (
  echo.
  echo PRE-FLIGHT FAILED: k6 executable was not found in PATH.
  echo Install k6 from https://grafana.com/docs/k6/latest/set-up/install-k6/
  exit /b 1
)

rem ---------------------------------------------------------------------------
rem 4. Pre-flight: required scripts and helpers
rem ---------------------------------------------------------------------------
set "PREFLIGHT_OK=1"

if not exist "%ROOT%nakama-load-test.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%nakama-load-test.js"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%config.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%config.js"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%load-env.bat" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%load-env.bat"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%scenarios\gameplay.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%scenarios\gameplay.js"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%helpers\auth.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%helpers\auth.js"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%helpers\pairing.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%helpers\pairing.js"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%helpers\gameplay.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%helpers\gameplay.js"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%helpers\websocket.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%helpers\websocket.js"
  set "PREFLIGHT_OK=0"
)
if not exist "%ROOT%helpers\nakama.js" (
  echo PRE-FLIGHT FAILED: missing "%ROOT%helpers\nakama.js"
  set "PREFLIGHT_OK=0"
)

if "%PREFLIGHT_OK%"=="0" (
  echo.
  echo Fix missing files before running the 100 CCU test.
  exit /b 1
)

rem ---------------------------------------------------------------------------
rem 5. Pre-flight: configuration sanity (1 VU = 1 TV + 1 mobile)
rem ---------------------------------------------------------------------------
if not "%TV_SESSIONS%"=="50" (
  echo PRE-FLIGHT FAILED: TV_SESSIONS must be 50 for run-100.bat
  exit /b 1
)
if not "%MOBILE_PLAYERS%"=="50" (
  echo PRE-FLIGHT FAILED: MOBILE_PLAYERS must be 50 for run-100.bat
  exit /b 1
)
if not "%TV_SESSIONS%"=="%MOBILE_PLAYERS%" (
  echo PRE-FLIGHT FAILED: TV_SESSIONS and MOBILE_PLAYERS must match (1:1 model)
  exit /b 1
)
if "%NAKAMA_HOST%"=="" (
  echo PRE-FLIGHT FAILED: NAKAMA_HOST is empty
  exit /b 1
)
if "%NAKAMA_PORT%"=="" (
  echo PRE-FLIGHT FAILED: NAKAMA_PORT is empty
  exit /b 1
)
if not defined NAKAMA_SERVER_KEY (
  echo PRE-FLIGHT FAILED: NAKAMA_SERVER_KEY is not set (device auth will fail)
  exit /b 1
)

rem ---------------------------------------------------------------------------
rem 6. Pre-flight: static k6 script validation (no load sent to server)
rem ---------------------------------------------------------------------------
echo.
echo Validating k6 script (static inspect, no VU execution)...
k6 inspect --execution-requirements ^
  -e ALLOW_HIGHER_LOAD=1 ^
  -e TV_SESSIONS=%TV_SESSIONS% ^
  -e MOBILE_PLAYERS=%MOBILE_PLAYERS% ^
  -e NAKAMA_HOST=%NAKAMA_HOST% ^
  -e NAKAMA_PORT=%NAKAMA_PORT% ^
  -e NAKAMA_SERVER_KEY=%NAKAMA_SERVER_KEY% ^
  -e SCENARIO=%SCENARIO% ^
  -e LOAD_PROFILE=%LOAD_PROFILE% ^
  -e COUNTDOWN_MS=%COUNTDOWN_MS% ^
  -e VIDEO_DURATION_MS=%VIDEO_DURATION_MS% ^
  "%ROOT%nakama-load-test.js" >nul 2>&1
if errorlevel 1 (
  echo PRE-FLIGHT FAILED: k6 could not parse nakama-load-test.js
  echo Run manually for details:
  echo   k6 inspect --execution-requirements -e ALLOW_HIGHER_LOAD=1 -e TV_SESSIONS=50 -e MOBILE_PLAYERS=50 -e NAKAMA_SERVER_KEY=*** "%ROOT%nakama-load-test.js"
  exit /b 1
)
echo k6 script validation: OK

rem ---------------------------------------------------------------------------
rem 7. Run summary (before load)
rem ---------------------------------------------------------------------------
echo.
echo ==================================================
echo NAKAMA LOAD TEST - 100 CCU
echo ==================================================
echo.
echo Host:            %NAKAMA_HOST%:%NAKAMA_PORT%
echo k6 VUs:          50
echo TV sessions:     50
echo Mobile players:  50
echo Total clients:   100
echo Mode:            HEAVY
echo.
echo 50 VU = 100 concurrent clients
echo Model:           1 VU = 1 TV + 1 mobile
echo.
echo Countdown:       %COUNTDOWN_MS%ms
echo Dance duration:  %VIDEO_DURATION_MS%ms
echo Load profile:    %LOAD_PROFILE%
echo Safety flag:     ALLOW_HIGHER_LOAD=%ALLOW_HIGHER_LOAD%
echo.
echo Load progression: VUs start together; each VU staggers by 5s
echo   (VU 1 at 0s, VU 10 ~45s, VU 25 ~120s, VU 50 ~245s)
echo   RAMP_UP=%RAMP_UP% is recorded for reference; executor uses per-vu-iterations.
echo.
echo Leaderboard:     disabled in test harness (writes must stay 0)
echo Auth:            device auth via NAKAMA_SERVER_KEY (same as smoke/LIGHT)
echo.
echo ==================================================
echo.

rem ---------------------------------------------------------------------------
rem 8. Execute HEAVY load test
rem ---------------------------------------------------------------------------
k6 run "%ROOT%nakama-load-test.js"
set "K6_EXIT=%ERRORLEVEL%"

echo.
if "%K6_EXIT%"=="0" (
  echo run-100.bat finished successfully.
) else (
  echo run-100.bat finished with errors (exit code %K6_EXIT%^).
)
echo Review summary.json and results.json in: %ROOT%
exit /b %K6_EXIT%
