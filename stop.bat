@echo off
setlocal
set PORT=4000
if exist .env for /f "usebackq tokens=2 delims==" %%a in (`findstr /b "PORT=" .env`) do set PORT=%%a
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% " ^| findstr LISTENING') do (
    taskkill /f /pid %%a >nul 2>&1 && echo Stopped proxy on port %PORT%
)
if not errorlevel 1 exit /b

rem fallback: try PowerShell
powershell -command "$p=Get-NetTCPConnection -LocalPort %PORT% -ErrorAction SilentlyContinue|Select-Object -First 1 -ExpandProperty OwningProcess;if($p){taskkill /f /pid $p|out-null;echo Stopped proxy on port %PORT%}else{echo No proxy process found on port %PORT%}"
