@echo off
setlocal
cd /d "%~dp0"
call npm test
if errorlevel 1 (echo TESTS FAILED & pause & exit /b 1)
echo All core tests passed.
pause
