const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("renamerApi", {
  selectFolder: () => ipcRenderer.invoke("dialog:selectFolder"),
  scan: (options) => ipcRenderer.invoke("renamer:scan", options),
  apply: (payload) => ipcRenderer.invoke("renamer:apply", payload),
  undo: () => ipcRenderer.invoke("renamer:undo"),
  exportLog: (payload) => ipcRenderer.invoke("renamer:exportLog", payload),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("renamer:progress", listener);
    return () => ipcRenderer.removeListener("renamer:progress", listener);
  },
});
