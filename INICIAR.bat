@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MEGA HUB AI
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js nao encontrado.
  echo  Instale a versao LTS em https://nodejs.org ^(botao verde^), feche esta janela e rode de novo.
  start "" https://nodejs.org/pt
  pause
  exit /b 1
)
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODEMAJOR=%%a
if %NODEMAJOR% LSS 20 (
  echo  Seu Node.js e antigo ^(versao %NODEMAJOR%^). Instale o LTS em https://nodejs.org e rode de novo.
  start "" https://nodejs.org/pt
  pause
  exit /b 1
)
if not exist ".next\BUILD_ID" (
  call INSTALAR.bat
  if not exist ".next\BUILD_ID" exit /b 1
)
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3100"
node server.mjs
pause
