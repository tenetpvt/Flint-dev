@echo off
set PYTHON_EXE=%~dp0backend\venv\Scripts\python.exe
if not exist "%PYTHON_EXE%" (
    echo [ERROR] Virtual environment python not found at %PYTHON_EXE%
    exit /b 1
)
"%PYTHON_EXE%" "%~dp0edge\main.py" %*
