@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MEGA HUB AI (com tunel)
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
if exist "cloudflared.exe" goto ok
where cloudflared >nul 2>nul
if not errorlevel 1 goto ok
echo  Instalando o cloudflared (tunel HTTPS gratuito da Cloudflare)...
winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
where cloudflared >nul 2>nul
if not errorlevel 1 goto ok
echo.
echo  Nao foi possivel instalar automaticamente.
echo  Baixe "cloudflared-windows-amd64.exe", renomeie para cloudflared.exe e coloque nesta pasta:
echo  %~dp0
start "" https://github.com/cloudflare/cloudflared/releases/latest
pause
exit /b 1
:ok
if not exist ".next\BUILD_ID" (
  call INSTALAR.bat
  if not exist ".next\BUILD_ID" exit /b 1
)
start "" cmd /c "timeout /t 8 >nul & start http://localhost:3100"
node server.mjs --tunnel
pause
