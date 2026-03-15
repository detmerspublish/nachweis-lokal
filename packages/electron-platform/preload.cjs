const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  db: {
    query: (sql, params) => ipcRenderer.invoke('db:query', sql, params),
    execute: (sql, params) => ipcRenderer.invoke('db:execute', sql, params),
  },
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  },
  fs: {
    copyFile: (src, destDir, fileName) => ipcRenderer.invoke('fs:copyFile', src, destDir, fileName),
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.invoke('update:install'),
    getState: () => ipcRenderer.invoke('update:getState'),
  },
  backup: {
    create: () => ipcRenderer.invoke('backup:create'),
    list: () => ipcRenderer.invoke('backup:list'),
    validate: (backupPath) => ipcRenderer.invoke('backup:validate', backupPath),
    restore: (backupPath) => ipcRenderer.invoke('backup:restore', backupPath),
    rotate: () => ipcRenderer.invoke('backup:rotate'),
  },
  support: {
    collectBundle: () => ipcRenderer.invoke('support:collectBundle'),
    compactInfo: () => ipcRenderer.invoke('support:compactInfo'),
    submitTicket: (description) => ipcRenderer.invoke('support:submitTicket', description),
    getTickets: () => ipcRenderer.invoke('support:getTickets'),
  },
  recovery: {
    checkDb: () => ipcRenderer.invoke('recovery:checkDb'),
    repairDb: () => ipcRenderer.invoke('recovery:repairDb'),
    getStatus: () => ipcRenderer.invoke('recovery:getStatus'),
  },
  license: {
    enterKey: (key) => ipcRenderer.invoke('license:enterKey', key),
    getStatus: () => ipcRenderer.invoke('license:getStatus'),
    removeKey: () => ipcRenderer.invoke('license:removeKey'),
    getHash: () => ipcRenderer.invoke('license:getHash'),
    revalidate: () => ipcRenderer.invoke('license:revalidate'),
    requestTrial: () => ipcRenderer.invoke('license:requestTrial'),
  },
  featureRequest: {
    submit: (data) => ipcRenderer.invoke('featureRequest:submit', data),
    list: () => ipcRenderer.invoke('featureRequest:list'),
    get: (requestNumber) => ipcRenderer.invoke('featureRequest:get', requestNumber),
    listPublic: () => ipcRenderer.invoke('featureRequest:listPublic'),
    vote: (requestNumber) => ipcRenderer.invoke('featureRequest:vote', requestNumber),
  },
  changelog: {
    list: () => ipcRenderer.invoke('changelog:list'),
  },
  audit: {
    append: (type, data, actor) => ipcRenderer.invoke('audit:append', type, data, actor),
    verify: (options) => ipcRenderer.invoke('audit:verify', options),
    getEvents: (options) => ipcRenderer.invoke('audit:getEvents', options),
  },
  mobile: {
    start: (inspectionId) => ipcRenderer.invoke('mobile:start', inspectionId),
    stop: () => ipcRenderer.invoke('mobile:stop'),
    getStatus: () => ipcRenderer.invoke('mobile:getStatus'),
    onResultUpdate: (callback) => ipcRenderer.on('mobile:resultUpdated', (_event, data) => callback(data)),
    removeResultListener: () => ipcRenderer.removeAllListeners('mobile:resultUpdated'),
  },
  app: {
    rendererReady: () => ipcRenderer.invoke('app:rendererReady'),
    isSafeMode: () => ipcRenderer.invoke('app:isSafeMode'),
  },
  firstRun: {
    complete: () => ipcRenderer.invoke('firstRun:complete'),
  },
});
