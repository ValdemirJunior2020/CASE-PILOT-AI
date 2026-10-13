@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules" (echo ERROR: Run INSTALL.bat first. & pause & exit /b 1)
if not exist "web\dist\index.html" (echo ERROR: React build missing. Run INSTALL.bat first. & pause & exit /b 1)
echo CasePilot AI running locally at http://127.0.0.1:4317
start "" "http://127.0.0.1:4317"
call npm start
if errorlevel 1 (echo ERROR: CasePilot failed to start. & pause & exit /b 1)
pause
