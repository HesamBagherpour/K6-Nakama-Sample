@echo off
setlocal EnableExtensions

title Nakama Dance Load Test - 25 VU MEDIUM

set "ROOT=%~dp0"
cd /d "%ROOT%"

call "%ROOT%load-env.bat"
if errorlevel 1 exit /b 1

rem MEDIUM: 25 VUs = 25 TV + 25 mobile = 50 total clients
set "LOAD_PROFILE=medium"
set "SCENARIO=gameplay"
set "MOBILE_PLAYERS=25"
set "TV_SESSIONS=25"
set "COUNTDOWN_MS=10000"
set "VIDEO_DURATION_MS=60000"
set "SCORE_INTERVAL_MS=1000"
set "FRAME_SYNC_INTERVAL_MS=250"
set "RAMP_UP=30s"
set "RAMP_DOWN=10s"

echo.
echo ============================================
echo NAKAMA LOAD LEVEL
echo ============================================
echo.
echo VU Level:        25 VU
echo Load Class:      MEDIUM
echo TV Sessions:     25
echo Mobile Players:  25
echo Total Clients:   50
echo.
echo ============================================
echo  25 VU MEDIUM — CONFIGURED BUT NOT RUN
echo ============================================
echo.
echo This phase only executes 10 VU LIGHT.
echo Do not run MEDIUM unless it is explicitly requested.
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
