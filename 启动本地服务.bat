@echo off
chcp 65001 >nul
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo 未检测到 npm，请先安装 Node.js：https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo 正在安装依赖...
  call npm install
)

echo.
echo 正在启动本地服务，浏览器打开后即可使用。
echo 请不要直接双击 index.html（开发入口需要本地服务）。
echo 若只需离线双击打开，请用：双击打开-PULSE.html
echo.
call npm run dev
