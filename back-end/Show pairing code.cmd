@echo off
REM Double-click this to show the code your phone scans when adding this PC.
cd /d "%~dp0"
if exist "node\node.exe" (
    "node\node.exe" pair.js
) else (
    node pair.js
)
echo.
pause
