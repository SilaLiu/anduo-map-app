# 安多县卫星地图标注工具 - 一键启动
$ErrorActionPreference = "Stop"

Write-Host "🚀 安多县卫星地图标注工具 - 一键启动" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $ScriptDir

# 检查 Node 环境
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 Node.js，请先安装 https://nodejs.org/" -ForegroundColor Red
    exit 1
}

$Runner = if (Get-Command pnpm -ErrorAction SilentlyContinue) { "pnpm" } else { "npm" }

Write-Host "📦 安装依赖..." -ForegroundColor Yellow
& $Runner install

Write-Host "启动浏览器开发服务..." -ForegroundColor Green
& $Runner start
