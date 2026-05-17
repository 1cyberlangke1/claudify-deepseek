@echo off
setlocal
set PORT=3000
if exist .env for /f "usebackq tokens=2 delims==" %%a in (`findstr /b "PORT=" .env`) do set PORT=%%a
netstat -ano | find ":%PORT%" | find "LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo claudify-deepseek already running on port %PORT%
    exit /b
)
powershell -Command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'src\index.js'"
echo claudify-deepseek started on port %PORT% (hidden window)
