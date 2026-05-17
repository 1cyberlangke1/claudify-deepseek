@echo off
setlocal
set PORT=3000
if exist .env for /f "usebackq tokens=2 delims==" %%a in (`findstr /b "PORT=" .env`) do set PORT=%%a
netstat -ano | find ":%PORT%" | find "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo Stopping existing instance on port %PORT%...
    for /f "tokens=5" %%a in ('netstat -ano ^| find ":%PORT%" ^| find "LISTENING"') do (
        taskkill /f /pid %%a >nul 2>&1
    )
    timeout /t 1 /nobreak >nul
)
powershell -Command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'src\index.js'"
echo claudify-deepseek started on port %PORT% (hidden window)
