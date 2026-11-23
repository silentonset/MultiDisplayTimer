const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('timerAPI', {
  getScreens: () => ipcRenderer.invoke('get-screens'),
  getDisplay1Status: () => ipcRenderer.invoke('get-display1-status'),
  onScreensChanged: (cb) => ipcRenderer.on('screens-changed', (_e, screens) => cb(screens)),
  setDisplay1Config: (cfg) => ipcRenderer.send('set-display1-config', cfg),
  onDisplay1Status: (cb) => ipcRenderer.on('display1-status', (_e, status) => cb(status)),

  sendTimerState: (payload) => ipcRenderer.send('timer-state', payload),
  onTimerState: (cb) => ipcRenderer.on('timer-state', (_e, payload) => cb(payload)),

  requestInitialState: () => ipcRenderer.send('request-initial-state'),
  onStateRequested: (cb) => ipcRenderer.on('state-requested', () => cb()),

  sendDisplay1Heartbeat: (hb) => ipcRenderer.send('display1-heartbeat', hb),
  onDisplay1Heartbeat: (cb) => ipcRenderer.on('display1-heartbeat', (_e, hb) => cb(hb))
});