@echo off
setlocal EnableExtensions

title Nakama Dance Load Test - Smoke (1 VU, 1 TV + 1 Mobile)

set "ROOT=%~dp0"
cd /d "%ROOT%"

call "%ROOT%load-env.bat"
if errorlevel 1 exit /b 1

rem Short full-lifecycle smoke: 1 VU = 1 TV + 1 mobile
set "LOAD_PROFILE=smoke"
set "SCENARIO=smoke"
set "MOBILE_PLAYERS=1"
set "TV_SESSIONS=1"
set "RAMP_UP=1s"
set "RAMP_DOWN=1s"
set "VIDEO_DURATION_MS=15000"
set "COUNTDOWN_MS=5000"
set "SCORE_INTERVAL_MS=1000"
set "FRAME_SYNC_INTERVAL_MS=250"

where k6 >nul 2>&1
if errorlevel 1 (
  echo ERROR: k6 executable was not found.
  exit /b 1
)

echo.
echo ============================================
echo  Nakama Just Dance - 1 VU Smoke Test
echo ============================================
echo Profile:       SMOKE (short full lifecycle; not LIGHT/MEDIUM/HEAVY)
echo Model:         1 TV + 1 mobile
echo k6 VUs:        1
echo Load Level:    UNCLASSIFIED (below LIGHT)
echo TV sessions:   %TV_SESSIONS%
echo Mobile players:%MOBILE_PLAYERS%
echo Total clients: 2
echo Gameplay:      %COUNTDOWN_MS%ms countdown + %VIDEO_DURATION_MS%ms dance
echo Host:          %NAKAMA_HOST%:%NAKAMA_PORT%
echo.

k6 run "%ROOT%nakama-load-test.js"
exit /b %ERRORLEVEL%
