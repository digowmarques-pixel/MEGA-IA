@echo off
chcp 65001 >nul
cd /d "%~dp0"
title MEGA HUB AI - Atualizacao
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
if exist ".git" (
  echo  Baixando a versao mais nova do GitHub...
  git pull
  if errorlevel 1 (
    echo  Falha no git pull. Confira se ha alteracoes locais.
    pause
    exit /b 1
  )
) else (
  echo  Esta pasta nao veio do GitHub: substitua os arquivos pela versao nova e rode este atalho de novo.
)
call INSTALAR.bat
