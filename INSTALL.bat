@echo off
setlocal
cd /d "%~dp0"
echo ==================================================
echo  CasePilot AI - LOCAL / FREE INSTALL
 echo ==================================================
where node >nul 2>&1 || (echo ERROR: Node.js 22+ is required. Get it from https://nodejs.org/ & pause & exit /b 1)
where npm >nul 2>&1 || (echo ERROR: npm is not installed. & pause & exit /b 1)
node -e "if(Number(process.versions.node.split('.')[0])<22)process.exit(1)" || (echo ERROR: Node 22 or newer required. & pause & exit /b 1)
if not exist "data" mkdir "data"
echo Installing open-source npm packages (first time requires internet)...
call npm install --no-audit --no-fund
if errorlevel 1 (echo ERROR: npm installation failed. Check network or antivirus. & pause & exit /b 1)
echo Checking local test suite...
call npm test
if errorlevel 1 (echo ERROR: Local tests failed. See error above. & pause & exit /b 1)
echo Building React user interface...
call npm run build
if errorlevel 1 (echo ERROR: React build failed. & pause & exit /b 1)
echo.
echo SUCCESS. Run START.bat to launch CasePilot AI.
echo Optional: install Ollama from https://ollama.com/ then: ollama pull qwen2.5:7b
pause
