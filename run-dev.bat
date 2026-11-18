@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Chưa cài Node.js. Hãy cài Node 20 trở lên từ https://nodejs.org rồi chạy lại.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Đang cài thư viện, vui lòng chờ...
  call npm install
  if errorlevel 1 (
    echo [LỖI] "npm install" bị hỏng. Kiểm tra kết nối mạng.
    pause
    exit /b 1
  )
)

call npm run dev
if errorlevel 1 (
  echo [LỖI] Chạy thử bị lỗi. Xem thông báo phía trên.
  pause
  exit /b 1
)
