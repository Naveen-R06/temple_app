@echo off
title Temple Contribution Manager
echo ===================================================
echo   Starting Temple Contribution & Records Manager
echo ===================================================
echo.
echo Launching server at http://localhost:3000 ...
echo Press Ctrl+C in this window anytime to stop the server.
echo.

start "" "http://localhost:3000"
node server.js
pause
