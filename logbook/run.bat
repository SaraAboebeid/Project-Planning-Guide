@echo off
REM Launch the logbook dashboard. Creates the venv first if it is missing.
REM   run.bat          use port 8501 (default)
REM   run.bat 8502     use a specific port
REM   set PORT=8503 && run.bat
setlocal
cd /d "%~dp0"

if not exist ".venv" (
    echo No virtual environment found - running setup first ...
    call "%~dp0setup.bat"
    if errorlevel 1 exit /b 1
)

set "LB_PORT=8501"
if not "%PORT%"=="" set "LB_PORT=%PORT%"
if not "%~1"=="" set "LB_PORT=%~1"

echo Starting the logbook on http://localhost:%LB_PORT%
".venv\Scripts\python.exe" -m streamlit run Tool.py --server.port %LB_PORT%
endlocal
