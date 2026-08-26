@echo off
REM Create (or refresh) the logbook virtual environment and install dependencies.
REM   setup.bat         update in place
REM   setup.bat CLEAN   delete .venv and rebuild from scratch
setlocal
cd /d "%~dp0"

if /I "%~1"=="CLEAN" (
    if exist ".venv" (
        echo Removing existing .venv ...
        rmdir /s /q ".venv"
    )
)

if not exist ".venv" (
    echo Creating virtual environment ...
    python -m venv .venv
    if errorlevel 1 (
        echo.
        echo Could not create the virtual environment.
        echo Check that Python 3.10+ is installed and on PATH.
        exit /b 1
    )
)

echo Installing dependencies ...
".venv\Scripts\python.exe" -m pip install --upgrade pip
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    exit /b 1
)

echo.
echo Done. Start the logbook with run.bat
endlocal
