@echo off
setlocal
cd /d "%~dp0"
set FARAWAY_AP_TRACE_EVERY_FRAME=1
openomsi.exe
pause
