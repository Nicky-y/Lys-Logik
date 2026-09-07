@echo off
cd /d "%~dp0"
set ASTRO_TELEMETRY_DISABLED=1
echo Starter Lys og Logik paa http://127.0.0.1:4321
call npm.cmd run dev -- --port 4321
pause
