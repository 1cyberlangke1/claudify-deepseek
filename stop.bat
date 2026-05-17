@echo off
setlocal
set PORT=3000
if exist .env for /f "usebackq tokens=2 delims==" %%a in (`findstr /b "PORT=" .env`) do set PORT=%%a
for /f "tokens=5" %%a in ('netstat -ano ^| find ":%PORT%" ^| find "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1 && echo Stopped proxy on port %PORT%
)
if not errorlevel 1 exit /b
echo No proxy process found on port %PORT%
