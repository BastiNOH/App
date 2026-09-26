@echo off
title Barcode Bridge
cd /d "%~dp0"

if not exist node_modules (
  echo Installiere Abhaengigkeiten, bitte kurz warten...
  call npm install
  if errorlevel 1 (
    echo.
    echo Installation fehlgeschlagen. Bitte obige Fehlermeldung pruefen.
    pause
    exit /b 1
  )
  echo.
)

echo Starte Barcode-Bridge-Server...
echo Der Browser oeffnet sich gleich automatisch. Dieses Fenster bitte offen lassen,
echo solange die App benutzt wird - schliessen beendet den Server.
echo.

start "" cmd /c "timeout /t 2 >nul && start https://localhost:3443/receiver"

node server\index.js

echo.
echo Server wurde beendet.
pause
