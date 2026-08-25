@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Nakama Dance Load Test - 10 Users (5 pairs, Smoke Profile)

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

rem PROFILE 1 — SMOKE: 10 total clients = 5 TV + 5 mobile = 5 k6 VUs (1:1)
set LOAD_PROFILE=smoke
set SCENARIO=gameplay
set MOBILE_PLAYERS=5
set TV_SESSIONS=5
set COUNTDOWN_MS=10000
set VIDEO_DURATION_MS=60000
set SCORE_INTERVAL_MS=1000
set FRAME_SYNC_INTERVAL_MS=250
set RAMP_UP=15s
set RAMP_DOWN=10s

if "%NAKAMA_HOST%"=="" set NAKAMA_HOST=85.198.11.216
if "%NAKAMA_PORT%"=="" set NAKAMA_PORT=7350

echo.
echo ============================================
echo  Nakama Just Dance - 10 User Smoke Test
echo ============================================
echo Profile:       SMOKE (full gameplay lifecycle)
echo Model:         1 TV + 1 mobile per VU
echo k6 VUs:        %TV_SESSIONS%
echo TV sessions:   %TV_SESSIONS%
echo Mobile players:%MOBILE_PLAYERS%
echo Total clients: %TV_SESSIONS% TV + %MOBILE_PLAYERS% mobile = 10
echo Gameplay:      %COUNTDOWN_MS%ms countdown + %VIDEO_DURATION_MS%ms dance
echo.
echo Do NOT run run-50.bat until this test passes.
echo.

where k6 >nul 2>&1
if errorlevel 1 (
  echo ERROR: k6 not found in PATH.
  exit /b 1
)

k6 run "%ROOT%nakama-load-test.js"
exit /b %ERRORLEVEL%
