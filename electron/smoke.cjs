const { app, BrowserWindow } = require("electron");

app.disableHardwareAcceleration();

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadURL("data:text/html,<h1>Electron smoke test</h1>");
});
