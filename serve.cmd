@echo off
REM ============================================================
REM  Yukjo Street promo page - local web server launcher
REM  (ASCII only: cmd.exe misparses UTF-8 Korean in .cmd files)
REM
REM  The page uses ES modules + wasm, so opening index.html via
REM  file:// does NOT work. It must be served over http://.
REM  Keep this window open while viewing the page.
REM ============================================================

cd /d "%~dp0"

REM Prefer the "py" launcher: on many Windows machines "python"
REM is a Microsoft Store stub that prints "Python" and exits.
py -c "pass" >nul 2>nul
if %errorlevel%==0 (
    echo [INFO] Starting server at http://localhost:8080 (py launcher^)
    echo [INFO] Keep this window open. Press Ctrl+C to stop.
    start "" http://localhost:8080/
    py -m http.server 8080
    goto :eof
)

python -c "pass" >nul 2>nul
if %errorlevel%==0 (
    echo [INFO] Starting server at http://localhost:8080 (python^)
    echo [INFO] Keep this window open. Press Ctrl+C to stop.
    start "" http://localhost:8080/
    python -m http.server 8080
    goto :eof
)

echo [INFO] Python not found - using npx http-server (first run may download^)
echo [INFO] Keep this window open. Press Ctrl+C to stop.
start "" http://localhost:8080/
npx --yes http-server -p 8080 -c-1

:eof
