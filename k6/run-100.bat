@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Nakama Dance Load Test - 100 Users (50 pairs, Stress Profile)

set "ROOT=%~dp0"
cd /d "%ROOT%"

if exist "%ROOT%..\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%..\.env") do (
    if not "%%A"=="" if not "%%~A"=="" set "%%A=%%B"
  )
)

if "%NAKAMA_SERVER_KEY%"=="" if "%NAKAMA_HTTP_KEY%"=="" (
  echo ERROR: Set NAKAMA_SERVER_KEY or NAKAMA_HTTP_KEY before running.
  exit /b 1
)

rem PROFILE 3 — STRESS: 100 total clients = 50 TV + 50 mobile = 50 k6 VUs (1:1)
set LOAD_PROFILE=stress
set SCENARIO=gameplay
set MOBILE_PLAYERS=50
set TV_SESSIONS=50
set COUNTDOWN_MS=10000
set VIDEO_DURATION_MS=60000
set SCORE_INTERVAL_MS=1000
set FRAME_SYNC_INTERVAL_MS=250
set RAMP_UP=60s
set RAMP_DOWN=15s

if "%NAKAMA_HOST%"=="" set NAKAMA_HOST=85.198.11.216
if "%NAKAMA_PORT%"=="" set NAKAMA_PORT=7350

echo.
echo ============================================
echo  Nakama Just Dance - 100 User Stress Test
echo ============================================
echo Profile:       STRESS
echo k6 VUs:        %TV_SESSIONS%
echo TV sessions:   %TV_SESSIONS%
echo Mobile players:%MOBILE_PLAYERS%
echo Total clients: %TV_SESSIONS% TV + %MOBILE_PLAYERS% mobile = 100
echo.

where k6 >nul 2>&1
if errorlevel 1 (
  echo ERROR: k6 not found in PATH.
  exit /b 1
)

k6 run "%ROOT%nakama-load-test.js"
exit /b %ERRORLEVEL%
