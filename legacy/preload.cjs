// Archived desktop bridge; the web app persists through IndexedDB.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  saveAnnotations: (data) => ipcRenderer.invoke('save-annotations', data),
  loadAnnotations: () => ipcRenderer.invoke('load-annotations'),
  saveBoundaries: (data) => ipcRenderer.invoke('save-boundaries', data),
  loadBoundaries: () => ipcRenderer.invoke('load-boundaries'),
  loadDefaultBoundary: () => ipcRenderer.invoke('load-default-boundary'),
  listLocalBoundaryLibrary: () => ipcRenderer.invoke('list-local-boundary-library'),
  loadLocalBoundaryFile: (relativePath) => ipcRenderer.invoke('load-local-boundary-file', relativePath),
  loadAllBoundaries: () => ipcRenderer.invoke('load-all-boundary-files'),
  exportGeoJSON: (data) => ipcRenderer.invoke('export-geojson', data),
});
