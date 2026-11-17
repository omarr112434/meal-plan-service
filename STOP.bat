@echo off
cd /d "%~dp0"
title Recipe Organizer
docker compose -f infra\floci\docker-compose.yml --profile app down
echo.
echo  Stopped. Your plans and shopping lists are kept for next time.
echo.
pause
