@echo off
cd /d "%~dp0"

where python >nul 2>&1
if %errorlevel% == 0 (
    echo Open http://localhost:8081 in your browser
    echo Press Ctrl+C to stop
    python -m http.server 8081
    goto :end
)

where python3 >nul 2>&1
if %errorlevel% == 0 (
    echo Open http://localhost:8081 in your browser
    echo Press Ctrl+C to stop
    python3 -m http.server 8081
    goto :end
)

echo Python not found. Please install Python.
pause

:end
