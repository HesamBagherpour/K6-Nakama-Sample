@echo off
rem Load project .env into the caller's environment.
rem IMPORTANT: this script must NOT use setlocal, or loaded variables would be discarded.

set "ENV_FILE="
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "ENV_FILE=%PROJECT_ROOT%\.env"

if not exist "%ENV_FILE%" (
  echo ERROR: .env file not found.
  echo Create it from .env.example.
  exit /b 1
)

rem One-line FOR body: no parentheses, so values/comments containing ")" cannot break parsing.
rem eol=# skips comment lines. Blank lines are skipped by FOR /F.
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do call :set_kv "%%A" "%%B"

if not defined NAKAMA_HOST (
  echo ERROR: NAKAMA_HOST is missing from .env.
  exit /b 1
)
if "%NAKAMA_HOST%"=="" (
  echo ERROR: NAKAMA_HOST is missing from .env.
  exit /b 1
)

if not defined NAKAMA_PORT (
  echo ERROR: NAKAMA_PORT is missing from .env.
  exit /b 1
)
if "%NAKAMA_PORT%"=="" (
  echo ERROR: NAKAMA_PORT is missing from .env.
  exit /b 1
)

if not defined NAKAMA_SERVER_KEY (
  echo ERROR: NAKAMA_SERVER_KEY is missing from .env.
  exit /b 1
)
if "%NAKAMA_SERVER_KEY%"=="" (
  echo ERROR: NAKAMA_SERVER_KEY is missing from .env.
  exit /b 1
)

call :is_placeholder "%NAKAMA_SERVER_KEY%"
if not errorlevel 1 (
  echo ERROR: NAKAMA_SERVER_KEY is still a placeholder.
  echo Please edit .env.
  exit /b 1
)

if defined NAKAMA_HTTP_KEY if not "%NAKAMA_HTTP_KEY%"=="" (
  call :is_placeholder "%NAKAMA_HTTP_KEY%"
  if not errorlevel 1 (
    echo ERROR: NAKAMA_HTTP_KEY is still a placeholder.
    echo Please edit .env.
    exit /b 1
  )
)

echo Loaded .env
echo NAKAMA_HOST=%NAKAMA_HOST%
echo NAKAMA_PORT=%NAKAMA_PORT%
echo NAKAMA_SERVER_KEY is set.
exit /b 0

:set_kv
if "%~1"=="" goto :eof
set "%~1=%~2"
goto :eof

:is_placeholder
rem Returns errorlevel 0 if the value is an obvious placeholder (do not echo it).
if /I "%~1"=="your_socket_server_key_here" exit /b 0
if /I "%~1"=="your_http_key_here" exit /b 0
if /I "%~1"=="YOUR_KEY" exit /b 0
if /I "%~1"=="CHANGE_ME" exit /b 0
if /I "%~1"=="changeme" exit /b 0
exit /b 1
