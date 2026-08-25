@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Nakama Dance Load Test - 50 Users (25 pairs, Load Profile)

set "ROOT=%~dp0"
cd /d "%ROOT%"

if exist "%ROOT%..\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%..\.env") do (
    if not "%%A"=="" if not "%%~A"=="" set "%%A=%%B"
  )
)

if "%NAKAMA_SERVER_KEY%"=="" if "%NAKAMA_HTTP_KEY%"=="" (
  echo ERROR: Set NAKAMA_SERVER_KEY or NAKAMA_HTTP_KEY before running.
  echo Copy .env.example to .env and fill in your keys.
  exit /b 1
)

rem PROFILE 2 — LOAD: 50 total clients = 25 TV + 25 mobile = 25 k6 VUs (1:1)
set LOAD_PROFILE=load
set SCENARIO=gameplay
set MOBILE_PLAYERS=25
set TV_SESSIONS=25
set COUNTDOWN_MS=10000
set VIDEO_DURATION_MS=60000
set SCORE_INTERVAL_MS=1000
set FRAME_SYNC_INTERVAL_MS=250
set RAMP_UP=30s
set RAMP_DOWN=10s

if "%NAKAMA_HOST%"=="" set NAKAMA_HOST=85.198.11.216
if "%NAKAMA_PORT%"=="" set NAKAMA_PORT=7350

echo.
echo ============================================
echo  Nakama Just Dance - 50 User Load Test
echo ============================================
echo Profile:       LOAD
echo k6 VUs:        %TV_SESSIONS%
echo TV sessions:   %TV_SESSIONS%
echo Mobile players:%MOBILE_PLAYERS%
echo Total clients: %TV_SESSIONS% TV + %MOBILE_PLAYERS% mobile = 50
echo.

where k6 >nul 2>&1
if errorlevel 1 (
  echo ERROR: k6 not found in PATH.
  exit /b 1
)

k6 run "%ROOT%nakama-load-test.js"
exit /b %ERRORLEVEL%
