const { app, BrowserWindow, dialog, ipcMain, net, protocol, session, Menu } = require('electron');
const { writeFile, readFile } = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { APP_ORIGIN, resourcePath } = require('./paths.cjs');
const { loadPack, safeFile } = require('./offline.cjs');
let offlinePack;
let offlineError;

// A stable origin keeps IndexedDB independent of HTTP port availability.
protocol.registerSchemesAsPrivileged([
  { scheme: 'anduo', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);
app.setName('AnduoSandtable');
// Use a separate, stable profile; never reuse the archived desktop application's data.
app.setPath('userData', path.join(app.getPath('appData'), 'AnduoSandtable'));
const profile = process.env.ANDUO_DESKTOP_TEST_PROFILE;
if (!app.isPackaged && profile) app.setPath('userData', path.resolve(profile));

let window;
function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 600,
    title: '安多县电子三维沙盘',
    backgroundColor: '#f7f9fa',
    fullscreen: true,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  const notifyFullscreen = () => window?.webContents.send('fullscreen-state', window.isFullScreen());
  window.on('enter-full-screen', notifyFullscreen);
  window.on('leave-full-screen', notifyFullscreen);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== `${APP_ORIGIN}/` && url !== `${APP_ORIGIN}/index.html`) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.loadURL(`${APP_ORIGIN}/`).catch((error) => {
    dialog.showErrorBox('沙盘启动失败', error.message);
  });
  window.on('closed', () => { window = undefined; });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(async () => {
    const root = path.join(app.getAppPath(), 'web-dist');
    const settingsFile = path.join(app.getPath('userData'), 'offline-settings.json');
    try {
      const settings = JSON.parse(await readFile(settingsFile, 'utf8'));
      try { if (!settings.disabled) offlinePack = await loadPack(settings.root); }
      catch (error) { offlineError = error.message; }
    } catch (error) {
      if (error.code !== 'ENOENT') offlineError = `离线配置读取失败：${error.message}`;
      else if (app.isPackaged || process.env.ANDUO_BUNDLED_PACK_TEST) {
        try {
          offlinePack = await loadPack(app.isPackaged
            ? path.join(process.resourcesPath, 'offline-pack')
            : path.join(app.getAppPath(), 'desktop-resources', 'offline-pack'));
        } catch (error) { offlineError = `内置离线包不可用：${error.message}`; }
      }
    }
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: '离线资源', submenu: [
      { label: '选择离线资源包目录…', click: async () => {
        const selected = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
        if (selected.canceled) return;
        try {
          const pack = await loadPack(selected.filePaths[0]);
          await writeFile(settingsFile, JSON.stringify({ root: pack.root }), 'utf8');
          offlinePack = pack;
          offlineError = undefined;
          window?.reload();
        } catch (error) { dialog.showErrorBox('离线资源校验失败', error.message); }
      } },
      { label: '查看离线资源状态', click: () => dialog.showMessageBox(window, {
        title: '离线资源状态', message: offlineError ? `离线包不可用：${offlineError}` : offlinePack
          ? `离线模式：${offlinePack.config.name}\n${offlinePack.root}\n基础清单及样例瓦片已校验，尚不代表全包完整性或全部功能离线验收通过。`
          : '当前为在线模式，尚未选择离线资源包。',
      }) },
      { label: '退出离线模式…', click: async () => {
        const result = await dialog.showMessageBox(window, { message: '退出后将允许访问在线地图和服务，是否继续？', buttons: ['取消', '退出离线模式'], defaultId: 0, cancelId: 0 });
        if (result.response !== 1) return;
        await writeFile(settingsFile, JSON.stringify({ disabled: true }), 'utf8');
        offlinePack = undefined;
        offlineError = undefined;
        window?.reload();
      } },
    ] }, { label: '窗口', submenu: [
      { label: '切换全屏', accelerator: 'F11', click: () => {
        if (window) window.setFullScreen(!window.isFullScreen());
      } },
      { label: '退出全屏', click: () => window?.setFullScreen(false) },
      { type: 'separator' },
      { label: '退出程序', role: 'quit' },
    ] }]));
    session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => {
      callback({ cancel: Boolean(offlinePack || offlineError) });
    });
    ipcMain.handle('window-fullscreen', async (event, action) => {
      if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('不允许此页面控制窗口');
      if (action === 'toggle') {
        window.setFullScreen(!window.isFullScreen());
      } else if (action !== 'get') throw new Error('不支持的窗口操作');
      return window.isFullScreen();
    });
    ipcMain.handle('export-json', async (event, content, filename) => {
      if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame)
        throw new Error('不允许此页面导出数据');
      if (typeof content !== 'string' || typeof filename !== 'string' || content.length > 100 * 1024 * 1024)
        throw new Error('导出数据无效或超过 100 MB');
      JSON.parse(content);
      const result = await dialog.showSaveDialog(window, {
        title: '导出沙盘数据',
        defaultPath: path.join(app.getPath('downloads'), path.basename(filename)),
        filters: [{ name: 'JSON / GeoJSON', extensions: ['json', 'geojson'] }],
      });
      if (result.canceled || !result.filePath) return false;
      await writeFile(result.filePath, content, 'utf8');
      return true;
    });
    const { parsePoint, planRoute } = await import('../server/routing.mjs');
    protocol.handle('anduo', async (request) => {
      try {
        const url = new URL(request.url);
        const file = resourcePath(root, request.url);
        if (request.method !== 'GET' && request.method !== 'HEAD')
          return new Response('Method not allowed', { status: 405 });
        if (url.pathname === '/api/offline') return Response.json(offlineError
          ? { enabled: true, error: offlineError, basemaps: {} }
          : offlinePack?.config || { enabled: false });
        if (url.pathname.startsWith('/offline/')) {
          if (!offlinePack) return new Response('Offline pack unavailable', { status: 404 });
          const local = await safeFile(offlinePack.root, decodeURIComponent(url.pathname.slice('/offline/'.length)));
          return await net.fetch(pathToFileURL(local).href);
        }
        if (url.pathname === '/api/route') {
          if (offlinePack || offlineError) return Response.json({ error: '离线模式：本地路由引擎尚未接入，不会调用高德网络服务' }, { status: 503 });
          if (!process.env.AMAP_WEB_KEY)
            return Response.json({ error: '桌面版尚未配置 AMAP_WEB_KEY，请配置系统环境变量并重启应用' }, { status: 503 });
          let start, end;
          try {
            start = parsePoint(url.searchParams.get('origin'));
            end = parsePoint(url.searchParams.get('destination'));
          } catch (error) {
            return Response.json({ error: error.message }, { status: 400 });
          }
          try {
            return Response.json(await planRoute(start, end, process.env.AMAP_WEB_KEY));
          } catch {
            return Response.json({ error: '路线服务请求失败，请检查网络和高德 Web 服务 Key' }, { status: 502 });
          }
        }
        return await net.fetch(pathToFileURL(file).href);
      } catch {
        return new Response('Resource not found', { status: 404 });
      }
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    session.defaultSession.on('will-download', (_event, item) => {
      item.setSaveDialogOptions({ title: '导出沙盘数据', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    });
    createWindow();
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
  }).catch((error) => {
    dialog.showErrorBox('沙盘启动失败', error.message);
    app.quit();
  });
}
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });