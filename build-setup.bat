@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   Build bản cài đặt (Windows x64)
echo ==============================================

where node >nul 2>nul
if errorlevel 1 (
  echo [LỖI] Chưa cài Node.js. Hãy cài Node 20 trở lên từ https://nodejs.org rồi chạy lại.
  goto :fail
)
node -e "process.exit(parseInt(process.versions.node)>=20?0:1)"
if errorlevel 1 (
  echo [LỖI] Node.js quá cũ. Cần Node 20 trở lên.
  node -v
  goto :fail
)
node -v

if not exist node_modules (
  echo.
  echo [Bước 1/4] Cài thư viện bằng npm install...
  call npm install
  if errorlevel 1 (
    echo [LỖI] Bước "npm install" bị hỏng. Kiểm tra kết nối mạng rồi chạy lại.
    goto :fail
  )
) else (
  echo [Bước 1/4] Đã có node_modules, bỏ qua cài thư viện.
)

echo.
echo [Bước 2/4] Kiểm tra cấu hình và icon...
call node scripts/prepare-build.mjs
if errorlevel 1 (
  echo [LỖI] Bước "prepare-build" bị hỏng. Xem thông báo phía trên.
  goto :fail
)

echo.
echo [Bước 3/4] Biên dịch mã nguồn...
call npm run build
if errorlevel 1 (
  echo [LỖI] Bước "npm run build" bị hỏng. Xem lỗi phía trên.
  goto :fail
)

echo.
echo [Bước 4/4] Đóng gói bản cài đặt...
set CSC_IDENTITY_AUTO_DISCOVERY=false
call npx electron-builder --win --publish never --config electron-builder.config.cjs
if errorlevel 1 (
  echo [LỖI] Bước "electron-builder" bị hỏng. Nếu thấy lỗi "symbolic link", hãy bật Developer Mode của Windows hoặc chạy file này bằng quyền Administrator.
  goto :fail
)

echo.
echo ==============================================
echo   XONG! Bản cài đặt nằm trong thư mục:
echo   %~dp0dist
echo ==============================================
dir /b "%~dp0dist\*.exe" 2>nul
pause
exit /b 0

:fail
echo.
echo Build thất bại.
pause
exit /b 1
