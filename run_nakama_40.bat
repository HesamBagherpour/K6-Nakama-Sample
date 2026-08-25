@echo off
setlocal EnableExtensions EnableDelayedExpansion

title Nakama k6 - 40 Clients

echo.
echo ============================================
echo      Nakama k6 - 40 Concurrent Clients
echo ============================================
echo.
echo BAT FILE STARTED SUCCESSFULLY
echo.

set "CURRENT_PATH=%~dp0"
set "K6_MSI=%CURRENT_PATH%k6-v2.2.0-windows-amd64.msi"
set "TEST_FILE=%CURRENT_PATH%nakama_40_clients.js"
set "K6_EXE="

echo Current folder:
echo %CURRENT_PATH%
echo.

echo --------------------------------------------
echo STEP 1 - Check k6
echo --------------------------------------------
echo.

where k6 >nul 2>&1

if !ERRORLEVEL! EQU 0 (
    set "K6_EXE=k6.exe"
    echo k6 found in PATH.
    echo.
    goto K6_FOUND
)

if exist "%ProgramFiles%\k6\k6.exe" (
    set "K6_EXE=%ProgramFiles%\k6\k6.exe"
    echo k6 found:
    echo %K6_EXE%
    echo.
    goto K6_FOUND
)

if exist "%ProgramFiles%\k6\bin\k6.exe" (
    set "K6_EXE=%ProgramFiles%\k6\bin\k6.exe"
    echo k6 found:
    echo %K6_EXE%
    echo.
    goto K6_FOUND
)

if exist "%ProgramFiles(x86)%\k6\k6.exe" (
    set "K6_EXE=%ProgramFiles(x86)%\k6\k6.exe"
    echo k6 found:
    echo %K6_EXE%
    echo.
    goto K6_FOUND
)

if exist "%ProgramFiles(x86)%\k6\bin\k6.exe" (
    set "K6_EXE=%ProgramFiles(x86)%\k6\bin\k6.exe"
    echo k6 found:
    echo %K6_EXE%
    echo.
    goto K6_FOUND
)

echo k6 is NOT installed.
echo.

echo --------------------------------------------
echo STEP 2 - Check MSI
echo --------------------------------------------
echo.

if not exist "%K6_MSI%" (
    echo ERROR: MSI FILE NOT FOUND
    echo.
    echo Expected:
    echo %K6_MSI%
    echo.
    echo Make sure this file exists in the same folder:
    echo k6-v2.2.0-windows-amd64.msi
    echo.
    goto ERROR_EXIT
)

echo MSI found:
echo %K6_MSI%
echo.

echo --------------------------------------------
echo STEP 3 - Install k6
echo --------------------------------------------
echo.

echo Starting MSI installer...
echo.
echo IMPORTANT:
echo You may need to run this BAT as Administrator.
echo.

msiexec.exe /i "%K6_MSI%" /norestart

set "MSI_EXIT=!ERRORLEVEL!"

echo.
echo MSI exit code = !MSI_EXIT!
echo.

if not "!MSI_EXIT!"=="0" (
    echo ERROR: k6 installation failed.
    echo MSI exit code: !MSI_EXIT!
    echo.
    goto ERROR_EXIT
)

echo k6 installation finished successfully.
echo.

echo Re-checking k6...
echo.

where k6 >nul 2>&1

if !ERRORLEVEL! EQU 0 (
    set "K6_EXE=k6.exe"
    goto K6_FOUND
)

if exist "%ProgramFiles%\k6\k6.exe" (
    set "K6_EXE=%ProgramFiles%\k6\k6.exe"
    goto K6_FOUND
)

if exist "%ProgramFiles%\k6\bin\k6.exe" (
    set "K6_EXE=%ProgramFiles%\k6\bin\k6.exe"
    goto K6_FOUND
)

if exist "%ProgramFiles(x86)%\k6\k6.exe" (
    set "K6_EXE=%ProgramFiles(x86)%\k6\k6.exe"
    goto K6_FOUND
)

if exist "%ProgramFiles(x86)%\k6\bin\k6.exe" (
    set "K6_EXE=%ProgramFiles(x86)%\k6\bin\k6.exe"
    goto K6_FOUND
)

echo ERROR: k6 installed but k6.exe was not found.
echo.
goto ERROR_EXIT


:K6_FOUND

echo ============================================
echo k6 FOUND
echo ============================================
echo.
echo Executable:
echo %K6_EXE%
echo.

echo --------------------------------------------
echo STEP 4 - k6 Version
echo --------------------------------------------
echo.

"%K6_EXE%" version

if !ERRORLEVEL! NEQ 0 (
    echo.
    echo ERROR: k6.exe could not be executed.
    echo.
    goto ERROR_EXIT
)

echo.
echo --------------------------------------------
echo STEP 5 - Check Test File
echo --------------------------------------------
echo.

if not exist "%TEST_FILE%" (
    echo ERROR: Test file not found.
    echo.
    echo Expected:
    echo %TEST_FILE%
    echo.
    goto ERROR_EXIT
)

echo Test file found:
echo %TEST_FILE%
echo.

echo --------------------------------------------
echo STEP 6 - Starting Load Test
echo --------------------------------------------
echo.
echo Target:
echo   85.198.11.216:7350
echo.
echo Clients:
echo   40 concurrent VUs
echo.
echo Test:
echo   Authenticate
echo   WebSocket Connect
echo   Keep Alive
echo.
echo --------------------------------------------
echo.

"%K6_EXE%" run "%TEST_FILE%"

set "K6_EXIT=!ERRORLEVEL!"

echo.
echo ============================================
echo k6 FINISHED
echo ============================================
echo.
echo Exit code: !K6_EXIT!
echo.

if "!K6_EXIT!"=="0" (
    echo TEST FINISHED SUCCESSFULLY
) else (
    echo TEST FINISHED WITH ERRORS
)

echo.
echo ============================================
echo PRESS ANY KEY TO CLOSE
echo ============================================
pause >nul

exit /b !K6_EXIT!


:ERROR_EXIT

echo.
echo ============================================
echo ERROR OCCURRED
echo ============================================
echo.
echo The window will stay open.
echo.
echo Press any key to close...
echo.
pause >nul

exit /b 1