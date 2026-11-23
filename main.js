const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

let controllerWin = null;
let display1Win = null;

let display1Config = {
  open: false,
  mode: 'fullscreen', // 'floating' | 'fullscreen'
  targetScreenId: null,
  alwaysOnTop: false
};

function getSerializedScreens() {
  const primaryId = screen.getPrimaryDisplay().id;
  return screen.getAllDisplays().map((d, index) => ({
    id: d.id,
    label: d.label || `Display ${index + 1}`,
    isPrimary: d.id === primaryId,
    bounds: d.bounds,
    workArea: d.workArea
  }));
}

function getTargetScreen(targetId) {
  const all = screen.getAllDisplays();
  return (
    all.find((d) => d.id === targetId) ||
    all.find((d) => d.id !== screen.getPrimaryDisplay().id) ||
    screen.getPrimaryDisplay()
  );
}

function emitScreens() {
  if (controllerWin && !controllerWin.isDestroyed()) {
    controllerWin.webContents.send('screens-changed', getSerializedScreens());
  }
}

function emitDisplay1Status() {
  if (!controllerWin || controllerWin.isDestroyed()) return;

  const targetScreen = getTargetScreen(display1Config.targetScreenId);
  const exists = Boolean(display1Win && !display1Win.isDestroyed());

  let status = {
    open: exists,
    visible: false,
    minimized: false,
    isFullscreen: false,
    mode: display1Config.mode,
    targetScreenId: targetScreen.id,
    targetScreenLabel: targetScreen.label || 'Display',
    targetBounds: targetScreen.bounds,
    actualBounds: null
  };

  if (exists) {
    status.visible = display1Win.isVisible();
    status.minimized = display1Win.isMinimized();
    status.isFullscreen = display1Win.isFullScreen();
    status.actualBounds = display1Win.getBounds();
  }

  controllerWin.webContents.send('display1-status', status);
}

function createControllerWindow() {
  const primary = screen.getPrimaryDisplay().workArea;
  controllerWin = new BrowserWindow({
    width: Math.min(1100, primary.width - 40),
    height: Math.min(780, primary.height - 40),
    title: 'Timer Controller',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  controllerWin.loadFile('controller.html');

  controllerWin.on('closed', () => {
    controllerWin = null;
    if (display1Win && !display1Win.isDestroyed()) {
      display1Win.close();
    }
  });
}

function createDisplay1Window(targetScreen) {
  const isFs = display1Config.mode === 'fullscreen';
  const b = isFs ? targetScreen.bounds : targetScreen.workArea;
  const w = isFs ? Math.min(800, b.width - 80) : Math.min(960, Math.round(b.width * 0.6));
  const h = isFs ? Math.min(600, b.height - 80) : Math.min(540, Math.round(b.height * 0.6));

  display1Win = new BrowserWindow({
    x: Math.round(b.x + (b.width - w) / 2),
    y: Math.round(b.y + (b.height - h) / 2),
    width: w,
    height: h,
    title: 'Display 1',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    alwaysOnTop: !isFs && Boolean(display1Config.alwaysOnTop),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  display1Win.loadFile('display.html');

  display1Win.once('ready-to-show', () => {
    if (display1Config.mode === 'fullscreen') {
      display1Win.setFullScreen(true);
    }
    display1Win.show();
    emitDisplay1Status();
  });

  const statusEvents = [
    'show',
    'hide',
    'minimize',
    'restore',
    'enter-full-screen',
    'leave-full-screen',
    'moved',
    'resized'
  ];
  statusEvents.forEach((ev) => display1Win.on(ev, emitDisplay1Status));

  display1Win.on('closed', () => {
    display1Win = null;
    display1Config.open = false;
    emitDisplay1Status();
  });
}

async function applyDisplay1Config(nextConfig) {
  display1Config = { ...display1Config, ...nextConfig };
  const targetScreen = getTargetScreen(display1Config.targetScreenId);
  display1Config.targetScreenId = targetScreen.id;

  if (!display1Config.open) {
    if (display1Win && !display1Win.isDestroyed()) {
      display1Win.close();
    }
    emitDisplay1Status();
    return;
  }

  if (!display1Win || display1Win.isDestroyed()) {
    createDisplay1Window(targetScreen);
    return;
  }

  if (display1Win.isMinimized()) {
    display1Win.restore();
  }

  display1Win.setAlwaysOnTop(
    display1Config.mode === 'floating' ? Boolean(display1Config.alwaysOnTop) : false
  );

  if (display1Config.mode === 'fullscreen') {
    if (display1Win.isFullScreen()) {
      display1Win.setFullScreen(false);
      await new Promise((r) => setTimeout(r, 60));
    }
    const b = targetScreen.bounds;
    display1Win.setBounds({
      x: b.x + 40,
      y: b.y + 40,
      width: Math.min(800, b.width - 80),
      height: Math.min(600, b.height - 80)
    });
    await new Promise((r) => setTimeout(r, 60));
    display1Win.setFullScreen(true);
    display1Win.show();
  } else {
    if (display1Win.isFullScreen()) {
      display1Win.setFullScreen(false);
      await new Promise((r) => setTimeout(r, 60));
    }
    const b = targetScreen.workArea;
    const w = Math.min(960, Math.round(b.width * 0.6));
    const h = Math.min(540, Math.round(b.height * 0.6));
    display1Win.setBounds({
      x: Math.round(b.x + (b.width - w) / 2),
      y: Math.round(b.y + (b.height - h) / 2),
      width: w,
      height: h
    });
    display1Win.show();
  }

  emitDisplay1Status();
}

app.whenReady().then(() => {
  // Default target screen to secondary display if one exists
  const nonPrimary = screen.getAllDisplays().find((d) => d.id !== screen.getPrimaryDisplay().id);
  display1Config.targetScreenId = nonPrimary ? nonPrimary.id : screen.getPrimaryDisplay().id;

  createControllerWindow();

  screen.on('display-added', () => { emitScreens(); emitDisplay1Status(); });
  screen.on('display-removed', () => { emitScreens(); emitDisplay1Status(); });
  screen.on('display-metrics-changed', () => { emitScreens(); emitDisplay1Status(); });

  ipcMain.handle('get-screens', () => getSerializedScreens());
  ipcMain.handle('get-display1-status', () => {
    emitDisplay1Status();
    return display1Config;
  });

  ipcMain.on('set-display1-config', (_e, cfg) => {
    applyDisplay1Config(cfg);
  });

  ipcMain.on('timer-state', (_e, payload) => {
    if (display1Win && !display1Win.isDestroyed()) {
      display1Win.webContents.send('timer-state', payload);
    }
  });

  ipcMain.on('request-initial-state', () => {
    if (controllerWin && !controllerWin.isDestroyed()) {
      controllerWin.webContents.send('state-requested');
    }
  });

  ipcMain.on('display1-heartbeat', (_e, heartbeat) => {
    if (controllerWin && !controllerWin.isDestroyed()) {
      controllerWin.webContents.send('display1-heartbeat', heartbeat);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});