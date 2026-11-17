@echo off
setlocal
cd /d "%~dp0"
title Recipe Organizer

echo.
echo  Recipe Organizer (Team 07) - starting on Floci
echo  -----------------------------------------------
echo.

docker info >nul 2>nul
if errorlevel 1 goto nodocker

if exist "backend\.env" goto haveenv
echo  Making backend\.env with a new random secret...
powershell -NoProfile -ExecutionPolicy Bypass -File "infra\windows\make-env.ps1"
if errorlevel 1 goto failed
:haveenv

echo  Starting Floci, the API and the website.
echo  The first time, Docker downloads everything: give it a few minutes.
echo.
docker compose -f infra\floci\docker-compose.yml --profile app up -d --build
if errorlevel 1 goto failed

echo.
echo  Waiting for the API...
set tries=0
:waitapi
set /a tries+=1
if %tries% gtr 90 goto slow
curl.exe -s -f -o NUL http://localhost:3000/api/health
if not errorlevel 1 goto ready
timeout /t 2 /nobreak >nul
goto waitapi

:ready
docker compose -f infra\floci\docker-compose.yml exec -T api node scripts/dev-token.js | clip
start "" http://localhost:8080/planner.html
echo.
echo  Done! The planner is opening in your browser.
echo  Your login token is already copied: click the box on the page,
echo  press Ctrl+V, then click "Use this token".
echo.
echo  Floci console (like the AWS console): http://localhost:4566/_floci/ui
echo  To stop everything, double-click STOP.bat (your data is kept).
echo.
pause
exit /b 0

:nodocker
echo  Docker Desktop is not running.
echo  Open Docker Desktop, wait until it says "Engine running",
echo  then double-click START.bat again.
echo.
pause
exit /b 1

:slow
echo  The API did not start. Its last log lines:
docker compose -f infra\floci\docker-compose.yml logs --tail 30 api
echo.
echo  Check the messages above for the problem.
pause
exit /b 1

:failed
echo.
echo  Something went wrong. Check the messages above for the problem.
pause
exit /b 1
