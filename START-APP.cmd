@echo off
cd /d "%~dp0"
echo Aabner Lys og Logik arbejdsrum paa http://127.0.0.1:5173
call npm.cmd run app:dev
pause
