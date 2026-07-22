@echo off
echo ============================================================
echo   CyberShield AI — Currency CNN ML Microservice
echo ============================================================
echo.

REM Change to the ml-service directory (where this script lives)
cd /d "%~dp0"

REM Check Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.9+ and add it to PATH.
    pause
    exit /b 1
)

REM Install / upgrade dependencies quietly
echo [1/3] Installing Python dependencies...
pip install -r requirements.txt --quiet
if errorlevel 1 (
    echo [ERROR] pip install failed. Check your internet connection.
    pause
    exit /b 1
)

echo [2/3] Dependencies installed.
echo [3/3] Starting FastAPI server on http://localhost:8000 ...
echo.
echo   Health check: http://localhost:8000/health
echo   Predict:      POST http://localhost:8000/predict
echo.
echo   Press Ctrl+C to stop.
echo.

uvicorn main:app --host 0.0.0.0 --port 8000 --reload
