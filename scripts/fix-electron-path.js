const fs = require('fs');
const path = require('path');

const electronPkgDir = path.join(__dirname, '..', 'node_modules', '.pnpm', 'electron@33.4.11', 'node_modules', 'electron');
const pathTxt = path.join(electronPkgDir, 'path.txt');
const distDir = path.join(electronPkgDir, 'dist');

function findElectronApp() {
  const candidates = [
    path.join(distDir, 'Electron.app'),
    path.join(__dirname, '..', 'node_modules', '.ignored', 'electron', 'dist', 'Electron.app'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

if (!fs.existsSync(pathTxt)) {
  const appPath = findElectronApp();
  if (!appPath) {
    console.error('❌ 未找到 Electron.app，请删除 node_modules 后重新运行 pnpm install');
    process.exit(1);
  }

  // 复制 .ignored 里的 dist 到正确位置（如果目标不存在）
  if (!fs.existsSync(distDir)) {
    const ignoredDist = path.join(__dirname, '..', 'node_modules', '.ignored', 'electron', 'dist');
    if (fs.existsSync(ignoredDist)) {
      fs.mkdirSync(path.dirname(distDir), { recursive: true });
      fs.cpSync(ignoredDist, distDir, { recursive: true, force: true });
      console.log('✅ 已复制 Electron dist 到正确位置');
    }
  }

  const relativePath = path.relative(path.join(electronPkgDir, 'dist'), path.join(appPath, 'Contents', 'MacOS', 'Electron'));
  fs.writeFileSync(pathTxt, relativePath);
  console.log('✅ 已修复 Electron 路径:', relativePath);
} else {
  console.log('✅ Electron 路径已存在');
}
