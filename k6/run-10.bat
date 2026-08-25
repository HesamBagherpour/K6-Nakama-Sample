@echo off
setlocal EnableExtensions

title Nakama Dance Load Test - 10 VU LIGHT

set "ROOT=%~dp0"
cd /d "%ROOT%"

call "%ROOT%load-env.bat"
if errorlevel 1 exit /b 1

rem LIGHT: 10 VUs = 10 TV + 10 mobile = 20 total clients
set "LOAD_PROFILE=light"
set "SCENARIO=gameplay"
set "MOBILE_PLAYERS=10"
set "TV_SESSIONS=10"
set "COUNTDOWN_MS=10000"
set "VIDEO_DURATION_MS=60000"
set "SCORE_INTERVAL_MS=1000"
set "FRAME_SYNC_INTERVAL_MS=250"
set "RAMP_UP=15s"
set "RAMP_DOWN=10s"

where k6 >nul 2>&1
if errorlevel 1 (
  echo ERROR: k6 executable was not found.
  exit /b 1
)

echo.
echo ============================================
echo NAKAMA LOAD LEVEL
echo ============================================
echo.
echo VU Level:        10 VU
echo Load Class:      LIGHT
echo TV Sessions:     10
echo Mobile Players:  10
echo Total Clients:   20
echo.
echo ============================================
echo  Nakama Just Dance - 10 VU LIGHT
echo ============================================
echo Profile:       LIGHT
echo Model:         1 TV + 1 mobile per VU
echo k6 VUs:        10
echo Load Level:    LIGHT
echo TV sessions:   10
echo Mobile players:10
echo Total clients: 20
echo Gameplay:      %COUNTDOWN_MS%ms countdown + %VIDEO_DURATION_MS%ms dance
echo Host:          %NAKAMA_HOST%:%NAKAMA_PORT%
echo.
echo MEDIUM 25 VU and HEAVY 50 VU are configured but not run.
echo.

k6 run "%ROOT%nakama-load-test.js"
exit /b %ERRORLEVEL%
