@echo off
setlocal
cd /d "%~dp0"
title Recipe Organizer - tests on Floci

echo.
echo  Running the 58 API tests against DynamoDB on Floci...
echo  (inside Docker, so Node does not need to be installed on this PC)
echo.

curl.exe -s -f -o NUL http://localhost:4566/_floci/health
if errorlevel 1 goto nofloci

docker run --rm --network team07_net -v "%cd%:/project" -w /project/backend -e TEST_DYNAMODB_ENDPOINT=http://floci:4566 node:24-alpine sh -c "npm ci --no-audit --no-fund --loglevel=error && node scripts/test-plan.js floci 'DynamoDB on Floci (the team07 Docker Compose stack)'"
if errorlevel 1 goto failed

echo.
echo  Done. The results are in docs\test-plan.md
echo.
pause
exit /b 0

:nofloci
echo  Floci is not running. Double-click START.bat first.
echo.
pause
exit /b 1

:failed
echo.
echo  Some tests failed or Docker had a problem. Check the messages above for the problem.
pause
exit /b 1
