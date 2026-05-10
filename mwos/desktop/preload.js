const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('mwosDesktop', {
  platform: process.platform,
});
