@echo off
setlocal EnableExtensions

title Nakama Dance Load Test - 50 VU HEAVY

set "ROOT=%~dp0"
cd /d "%ROOT%"

call "%ROOT%load-env.bat"
if errorlevel 1 exit /b 1

rem HEAVY: 50 VUs = 50 TV + 50 mobile = 100 total clients
set "LOAD_PROFILE=heavy"
set "SCENARIO=gameplay"
set "MOBILE_PLAYERS=50"
set "TV_SESSIONS=50"
set "COUNTDOWN_MS=10000"
set "VIDEO_DURATION_MS=60000"
set "SCORE_INTERVAL_MS=1000"
set "FRAME_SYNC_INTERVAL_MS=250"
set "RAMP_UP=60s"
set "RAMP_DOWN=15s"

echo.
echo ============================================
echo NAKAMA LOAD LEVEL
echo ============================================
echo.
echo VU Level:        50 VU
echo Load Class:      HEAVY
echo TV Sessions:     50
echo Mobile Players:  50
echo Total Clients:   100
echo.
echo ============================================
echo  50 VU HEAVY — CONFIGURED BUT NOT RUN
echo ============================================
echo.
echo This phase only executes 10 VU LIGHT.
echo Do not run HEAVY unless it is explicitly requested.
echo.
echo To run later, set ALLOW_HIGHER_LOAD=1 and re-run this launcher.
echo.

if /I not "%ALLOW_HIGHER_LOAD%"=="1" (
  exit /b 1
)

where k6 >nul 2>&1
if errorlevel 1 (
  echo ERROR: k6 executable was not found.
  exit /b 1
)

k6 run "%ROOT%nakama-load-test.js"
exit /b %ERRORLEVEL%
