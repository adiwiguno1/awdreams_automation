const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  startScraper: (payload) => ipcRenderer.invoke('scraper:start', payload || {}),
  pauseScraper: () => ipcRenderer.invoke('scraper:pause'),
  stopScraper: () => ipcRenderer.invoke('scraper:stop'),

  onLogMessage: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on('log-message', listener);
    return () => ipcRenderer.removeListener('log-message', listener);
  },

  onScraperStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('scraper:status', listener);
    return () => ipcRenderer.removeListener('scraper:status', listener);
  },

  onMenuCommand: (callback) => {
    const listener = (_event, command) => callback(command);
    ipcRenderer.on('menu-command', listener);
    return () => ipcRenderer.removeListener('menu-command', listener);
  },

  onBrowserAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on('browser-action', listener);
    return () => ipcRenderer.removeListener('browser-action', listener);
  }
});
