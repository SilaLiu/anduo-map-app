const { contextBridge, ipcRenderer } = require('electron');

// Expose only fixed operations, not Node or arbitrary IPC access.
contextBridge.exposeInMainWorld('anduoDesktop', {
  exportJson: (content, filename) => ipcRenderer.invoke('export-json', content, filename),
  getFullscreen: () => ipcRenderer.invoke('window-fullscreen', 'get'),
  toggleFullscreen: () => ipcRenderer.invoke('window-fullscreen', 'toggle'),
  onFullscreenChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('fullscreen-state', listener);
    return () => ipcRenderer.removeListener('fullscreen-state', listener);
  },
});