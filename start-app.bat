@echo off
setlocal
title UAE Marketing Hub - local app
cd /d "%~dp0"

echo.
echo  UAE Marketing Hub - starting the local app
echo  ------------------------------------------
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
  echo  pnpm was not found. Install Node.js from nodejs.org, then run:  npm install -g pnpm
  echo.
  pause
  exit /b 1
)

rem Already running? Then just open it instead of starting a second copy (which would refuse to start).
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
  echo  The app is already running at http://localhost:3000 - opening it.
  if not defined NO_BROWSER start "" "http://localhost:3000"
  timeout /t 3 >nul
  exit /b 0
)

if not exist "node_modules" (
  echo  First run: installing dependencies. This can take a few minutes...
  echo.
  call pnpm install
  if errorlevel 1 (
    echo.
    echo  The install failed. Scroll up to see why.
    pause
    exit /b 1
  )
)

if not exist ".env" echo  WARNING: there is no .env file here, so the app cannot reach its database. Copy it from your backup.

echo  Starting the server. Your browser opens by itself when the app is ready.
echo  Leave this window open while you work. Close it, or press Ctrl+C, to stop the app.
echo.

rem Open the browser once the app answers. Set NO_BROWSER=1 to skip this.
if not defined NO_BROWSER start "" /b powershell -NoProfile -WindowStyle Hidden -Command "for ($i = 0; $i -lt 120; $i++) { try { Invoke-WebRequest -Uri http://localhost:3000/login -UseBasicParsing -TimeoutSec 3 | Out-Null; Start-Process http://localhost:3000; break } catch { Start-Sleep -Seconds 1 } }"

call pnpm dev

echo.
echo  The server stopped.
pause
