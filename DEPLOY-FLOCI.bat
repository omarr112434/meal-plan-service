@echo off
setlocal
cd /d "%~dp0"
title Recipe Organizer - deploy on Floci

echo.
echo  Meal Plan and Shopping List service - deploy on Floci (the doctor's lab setup)
echo  S3 website + API Gateway + Lambda + DynamoDB + IAM + Secrets Manager + CloudWatch + SNS
echo  --------------------------------------------------------------------------------
echo.

docker info >nul 2>nul
if errorlevel 1 goto nodocker

if exist "backend\.env" goto haveenv
echo  Making backend\.env with a new random secret...
powershell -NoProfile -ExecutionPolicy Bypass -File "infra\windows\make-env.ps1"
if errorlevel 1 goto failed
:haveenv

echo  Starting Floci...
docker compose -f infra\floci\docker-compose.yml up -d floci
if errorlevel 1 goto failed
set tries=0
:waitfloci
set /a tries+=1
if %tries% gtr 60 goto nofloci
curl.exe -s -f -o NUL http://localhost:4566/_floci/health
if not errorlevel 1 goto deploy
timeout /t 2 /nobreak >nul
goto waitfloci

:deploy
echo  Floci is running. Deploying (the first time downloads a few things, give it a few minutes)...
docker run --rm --network team07_net -v "%cd%:/project" -v team07_npm_cache:/root/.npm -e PROJECT_DIR=/project node:22-alpine sh -c "cp -r /project/infra/floci/deploy /tmp/deploy && cd /tmp/deploy && npm ci --no-audit --no-fund --loglevel=error && node deploy.js"
if errorlevel 1 goto failed

set /p SITE=<infra\floci\deploy\out\site-url.txt
clip < infra\floci\deploy\out\token.txt
del infra\floci\deploy\out\token.txt
start "" "%SITE%planner.html"
echo.
echo  Done! The planner is opening from S3: %SITE%planner.html
echo  Your login token is copied: click the big box, press Ctrl+V, then "Use this token".
echo  An admin token (for the admin test) is in infra\floci\deploy\out\admin-token.txt
echo.
echo  Floci console (like the AWS console): http://localhost:4566/_floci/ui
echo.
pause
exit /b 0

:nodocker
echo  Docker Desktop is not running.
echo  Open Docker Desktop, wait until it says "Engine running", then double-click this file again.
echo.
pause
exit /b 1

:nofloci
echo  Floci did not start. Its last log lines:
docker compose -f infra\floci\docker-compose.yml logs --tail 30 floci
pause
exit /b 1

:failed
echo.
echo  Something went wrong. Check the messages above for the problem.
pause
exit /b 1
