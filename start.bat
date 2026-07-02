@echo off
setlocal
set PORT=4000

netstat -ano | findstr /c:":%PORT%" | findstr /c:LISTENING >nul 2>&1
if not errorlevel 1 (
    echo Stopping existing instance on port %PORT%...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr /c:":%PORT%" ^| findstr /c:LISTENING') do (
        taskkill /f /pid %%a >nul 2>&1
    )
    timeout /t 1 /nobreak >nul
)

powershell -Command "Start-Process -WindowStyle Hidden -FilePath 'node' -ArgumentList 'src\index.js'"
echo claudify-deepseek started on port %PORT% (hidden window)
