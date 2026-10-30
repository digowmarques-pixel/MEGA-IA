@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MEGA HUB AI - Instalacao
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
echo.
echo  [1/2] Baixando dependencias (alguns minutos na primeira vez)...
call npm ci --no-audit --no-fund
if errorlevel 1 (
  echo  Falha ao baixar as dependencias. Confira a internet e rode de novo.
  pause
  exit /b 1
)
echo.
echo  [2/2] Compilando o hub...
call npm run build
if errorlevel 1 (
  echo  Falha na compilacao. Mande um print desta janela para o suporte.
  pause
  exit /b 1
)
echo.
echo  Pronto! Agora de dois cliques em INICIAR.bat
echo.
pause
