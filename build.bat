@echo off
cd /d "%~dp0"
if exist build rmdir /s /q build
if exist dist rmdir /s /q dist
echo Building...
call .venv\Scripts\python.exe -m PyInstaller build.spec --noconfirm --log-level WARN
if exist "dist\AI-Pet.exe" (echo SUCCESS: dist\AI-Pet.exe) else (echo FAILED)
pause
