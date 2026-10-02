#!/usr/bin/env bash
set -e

echo "安多县三维沙盘 - 网页开发服务"

# 进入脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 检查 Node 环境
if ! command -v node &> /dev/null; then
    echo "❌ 未找到 Node.js，请先安装 https://nodejs.org/"
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "⚠️  未找到 pnpm，尝试使用 npm..."
    RUNNER="npm"
else
    RUNNER="pnpm"
fi

echo "📦 安装依赖..."
$RUNNER install

echo "启动浏览器开发服务..."
$RUNNER start
