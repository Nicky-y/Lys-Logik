@echo off
cd /d "%~dp0"
echo Aabner proevevisning paa http://127.0.0.1:5174
call npm.cmd run app:demo
pause
