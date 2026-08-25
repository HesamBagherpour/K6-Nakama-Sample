@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

if exist "%ROOT%..\.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%ROOT%..\.env") do (
    if not "%%A"=="" set "%%A=%%B"
  )
)

set SCENARIO=smoke
set MOBILE_PLAYERS=1
set TV_SESSIONS=1
set RAMP_UP=1s
set RAMP_DOWN=1s
set VIDEO_DURATION_MS=15000
set COUNTDOWN_MS=5000

if "%NAKAMA_HOST%"=="" set NAKAMA_HOST=85.198.11.216
if "%NAKAMA_PORT%"=="" set NAKAMA_PORT=7350

k6 run --iterations 1 --vus 1 "%ROOT%nakama-load-test.js"
exit /b %ERRORLEVEL%
