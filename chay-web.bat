@echo off
chcp 65001 >nul
title EngEdu - Web cong khai
cd /d "%~dp0"
if not exist node_modules (
  echo Dang cai thu vien lan dau...
  call npm install
)
if not exist data\engedu.db (
  echo Dang tao du lieu mau lan dau...
  call npm run seed
)
call npm run public
pause
