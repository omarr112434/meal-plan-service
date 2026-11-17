@echo off
cd /d "%~dp0"
title Recipe Organizer
curl.exe -s -f -o NUL http://localhost:3000/api/health
if errorlevel 1 goto notrunning
docker compose -f infra\floci\docker-compose.yml exec -T api node scripts/dev-token.js | clip
echo.
echo  New login token copied (it lasts 8 hours).
echo  On the page: click the box, press Ctrl+V, then "Use this token".
echo.
pause
exit /b 0

:notrunning
echo.
echo  The app is not running. Double-click START.bat first.
echo.
pause
exit /b 1
