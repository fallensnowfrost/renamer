const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const isDev = !app.isPackaged;
const imageExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"]);
const videoExtensions = new Set([".mp4", ".mkv", ".mov", ".avi", ".wmv", ".flv", ".webm", ".m4v"]);
const statSuffixPattern = /(?:\s*[\[(]\s*(?:\d+\s*P(?:\s*\d+\s*V)?|\d+\s*V)(?:\s+\d+(?:\.\d+)?(?:MB|GB))?\s*[\])]\s*)+$/i;

let mainWindow;
let lastRenameLog = null;

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    title: "Smart Renamer / 智能重命名",
    icon: path.join(__dirname, "../assets/smart-renamer-icon.ico"),
    backgroundColor: "#f6f7f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer process gone:", details);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription) => {
    console.error("Renderer failed to load:", errorCode, errorDescription);
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("dialog:selectFolder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("renamer:scan", async (event, options) => scanRoot(options, event.sender));
ipcMain.handle("renamer:apply", async (event, payload) => applyRenamePlan(payload, event.sender));
ipcMain.handle("renamer:undo", async () => undoLastRename());
ipcMain.handle("renamer:exportLog", async (_event, payload) => exportLog(payload));

async function scanRoot(options, sender) {
  const rootPath = assertRootPath(options.rootPath);
  const personName = String(options.personName || "").trim();
  const sortMode = options.sortMode || "natural";
  sendProgress(sender, { phase: "scan", current: 0, total: 0, label: "正在收集子文件夹 / Collecting folders..." });
  const folderPaths = await collectDirectories(rootPath);
  const groups = [];

  for (const [index, folderPath] of folderPaths.entries()) {
    sendProgress(sender, {
      phase: "scan",
      current: index + 1,
      total: folderPaths.length,
      label: path.basename(folderPath),
    });
    const folderName = path.basename(folderPath);
    const directEntries = await safeReadDir(folderPath);
    const directFiles = directEntries.filter((entry) => entry.isFile());
    const mediaFiles = [];

    for (const entry of directFiles) {
      const filePath = path.join(folderPath, entry.name);
      const kind = getMediaKind(entry.name);
      if (!kind) continue;
      const fileStat = await fs.stat(filePath);
      mediaFiles.push({
        name: entry.name,
        path: filePath,
        extension: path.extname(entry.name),
        kind,
        size: fileStat.size,
        modifiedTime: fileStat.mtimeMs,
        createdTime: fileStat.birthtimeMs,
      });
    }

    const theme = extractTheme(folderName, personName);
    const folderStats = buildFolderStats(mediaFiles);
    const targetFolderName = withStatsSuffix(folderName, folderStats.suffix, personName);
    const fileItems = buildMediaFileItems(mediaFiles, sortMode).map((file) => {
      return {
        ...file,
        targetPath: path.join(folderPath, file.targetName),
        status: file.name === file.targetName ? "unchanged" : "ready",
        warnings: [],
      };
    });

    groups.push({
      id: folderPath,
      path: folderPath,
      parentPath: path.dirname(folderPath),
      originalName: folderName,
      targetFolderName,
      targetFolderPath: path.join(path.dirname(folderPath), targetFolderName),
      theme: theme.value,
      confidence: theme.confidence,
      themeWarnings: theme.warnings,
      folderStats,
      files: fileItems,
      depth: relativeDepth(rootPath, folderPath),
      status: folderName === targetFolderName ? "unchanged" : "ready",
      warnings: [],
    });
  }

  const result = validateScan({ rootPath, personName, sortMode, groups });
  sendProgress(sender, { phase: "complete", current: folderPaths.length, total: folderPaths.length, label: "扫描完成 / Scan complete" });
  return result;
}

async function collectDirectories(rootPath) {
  const collected = [];
  async function walk(currentPath) {
    const entries = await safeReadDir(currentPath);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childPath = path.join(currentPath, entry.name);
      collected.push(childPath);
      await walk(childPath);
    }
  }
  await walk(rootPath);
  return collected;
}

async function safeReadDir(folderPath) {
  try {
    return await fs.readdir(folderPath, { withFileTypes: true });
  } catch {
    return [];
  }
}

function assertRootPath(rootPath) {
  if (!rootPath || typeof rootPath !== "string") {
    throw new Error("请选择根文件夹 / Please select a root folder.");
  }
  return rootPath;
}

function getMediaKind(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (imageExtensions.has(ext)) return "image";
  if (videoExtensions.has(ext)) return "video";
  return null;
}

function buildFolderStats(files) {
  const images = files.filter((file) => file.kind === "image");
  const videos = files.filter((file) => file.kind === "video");
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const parts = [];
  if (images.length > 0) parts.push(`${images.length}P`);
  if (videos.length > 0) parts.push(`${videos.length}V`);
  if (totalBytes > 0) parts.push(formatSize(totalBytes));
  return {
    imageCount: images.length,
    videoCount: videos.length,
    totalBytes,
    suffix: parts.length > 0 ? `[${parts.join(" ")}]` : "",
  };
}

function formatSize(bytes) {
  const mb = bytes / 1024 / 1024;
  if (mb < 1024) return `${Math.max(Math.round(mb), 1)}MB`;
  return `${(mb / 1024).toFixed(2)}GB`;
}

function withStatsSuffix(folderName, suffix, personName) {
  const baseName = normalizeFolderDisplayName(stripStatsSuffix(folderName), personName);
  return suffix ? `${baseName} ${suffix}` : baseName;
}

function normalizeFolderDisplayName(folderName, personName) {
  if (!personName) return folderName.trim();
  const protectedLabel = extractLeadingPersonLabel(folderName, personName);
  const personLabel = protectedLabel || formatPersonLabel(personName);
  let rest = protectedLabel ? folderName.slice(protectedLabel.length) : folderName;
  rest = rest.replace(/^\s*[-_、，,]+\s*/, " ");
  rest = removePersonName(rest, personName);
  if (protectedLabel) {
    rest = rest.replace(/^\s*\([^)]*\)\s*-\s*/, "");
    rest = rest.replace(/^\s*（[^）]*）\s*-\s*/, "");
  }
  rest = rest.replace(/\(\s*\)|（\s*）|\[\s*\]/g, " ");
  rest = rest.replace(/(^|[\s\-_,，、])[\])）]+(?=$|[\s\-_,，、])/g, " ");
  rest = rest.replace(/(?:\s*-\s*){2,}/g, " - ");
  rest = rest.replace(/^\s*[-_、，,]+\s*/, "");
  rest = rest.replace(/\s+/g, " ").trim();
  return personLabel ? `${personLabel}${rest ? ` - ${rest}` : ""}` : rest;
}

function extractLeadingPersonLabel(folderName, personName) {
  const match = folderName.match(/^\s*(\[[^\]]+\])/);
  if (!match) return "";
  const label = match[1].trim();
  const labelText = label.replace(/^\[|\]$/g, "");
  const cleaned = removePersonName(labelText, personName).replace(/\s+/g, "").trim();
  return cleaned ? "" : label;
}

function formatPersonLabel(personName) {
  const trimmed = personName.trim();
  if (!trimmed) return "";
  if (/^\[[^\]]+\]$/.test(trimmed)) return trimmed;
  return `[${trimmed}]`;
}

function extractTheme(folderName, personName) {
  const warnings = [];
  let value = stripStatsSuffix(folderName);
  value = value.replace(/\[[^\]]*\]|\([^)]*\)|（[^）]*）/g, " ");
  if (personName) {
    value = removePersonName(value, personName);
  }
  value = value
    .replace(/\b(?:19|20)\d{2}[.\-_年/]?(?:0?[1-9]|1[0-2])?[.\-_月/]?(?:0?[1-9]|[12]\d|3[01])?日?\b/g, " ")
    .replace(/^\s*(?:第?\d+集?|\d{1,5}|[A-Z]\d{1,4})\s*[-_ .、，]+/i, " ")
    .replace(/[-_]+/g, " ")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!value) {
    value = "待确认主题";
    warnings.push("主题为空，需要手动确认 / Empty theme, please confirm.");
  }
  if (value.length <= 1) {
    warnings.push("主题过短 / Theme is too short.");
  }
  return {
    value,
    confidence: warnings.length ? "low" : "high",
    warnings,
  };
}

function stripStatsSuffix(value) {
  let next = value;
  let previous = "";
  while (next !== previous) {
    previous = next;
    next = next.replace(statSuffixPattern, "").trim();
  }
  return next;
}

function removePersonName(input, personName) {
  let value = input;
  for (const pattern of buildPersonPatterns(personName)) {
    value = value.replace(pattern, " ");
  }
  return value;
}

function buildPersonPatterns(personName) {
  const variants = new Set();
  const trimmed = personName.trim();
  if (!trimmed) return [];
  variants.add(trimmed);
  variants.add(trimmed.replace(/^\[|\]$/g, ""));
  variants.add(trimmed.replace(/-/g, " "));
  variants.add(trimmed.replace(/\s+/g, " "));
  variants.add(trimmed.replace(/^\[|\]$/g, "").replace(/-/g, " "));
  variants.add(trimmed.replace(/^\[|\]$/g, "").replace(/\s+/g, " "));

  const unwrapped = trimmed.replace(/^\[|\]$/g, "");
  const hangulParts = unwrapped.match(/[\uac00-\ud7af]+/g) || [];
  for (const part of hangulParts) variants.add(part);

  const latinParts = unwrapped.match(/[A-Za-z]+(?:[-\s]+[A-Za-z]+)+/g) || [];
  for (const part of latinParts) {
    variants.add(part);
    variants.add(part.replace(/-/g, " "));
  }

  return [...variants]
    .filter((variant) => variant.length > 1)
    .sort((a, b) => b.length - a.length)
    .map((variant) => new RegExp(`(^|[\\s\\[\\](){},._\\-])${variantToLoosePattern(variant)}(?=$|[\\s\\[\\](){},._\\-])`, "gi"));
}

function variantToLoosePattern(variant) {
  return escapeRegExp(variant.trim()).replace(/\\-/g, "[-\\s]+").replace(/\s+/g, "[-\\s]+");
}

function removeText(input, target, caseSensitive) {
  if (!target) return input;
  const flags = caseSensitive ? "g" : "gi";
  return input.replace(new RegExp(escapeRegExp(target), flags), " ");
}

function sortMediaFiles(files, sortMode) {
  return [...files].sort((a, b) => {
    if (sortMode === "modified") return a.modifiedTime - b.modifiedTime || naturalCompare(a.name, b.name);
    if (sortMode === "created") return a.createdTime - b.createdTime || naturalCompare(a.name, b.name);
    return naturalCompare(a.name, b.name);
  });
}

function buildMediaFileItems(files, sortMode) {
  const sortedAll = sortMediaFiles(files, sortMode);
  const byKind = new Map();
  for (const kind of ["image", "video"]) {
    const kindFiles = sortMediaFiles(files.filter((file) => file.kind === kind), sortMode);
    const width = String(Math.max(kindFiles.length, 1)).length;
    kindFiles.forEach((file, index) => {
      const sequence = String(index + 1).padStart(width, "0");
      byKind.set(file.path, `${sequence}${file.extension}`);
    });
  }
  return sortedAll.map((file) => ({
    ...file,
    targetName: byKind.get(file.path) || file.name,
  }));
}

function naturalCompare(a, b) {
  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function relativeDepth(rootPath, folderPath) {
  const relative = path.relative(rootPath, folderPath);
  return relative.split(path.sep).filter(Boolean).length;
}

function validateScan(scan) {
  const folderTargets = new Map();
  const fileTargets = new Map();

  for (const group of scan.groups) {
    const folderWarnings = [...group.themeWarnings];
    if (hasInvalidName(group.targetFolderName)) folderWarnings.push("目标文件夹名包含非法字符 / Invalid folder name.");
    addTarget(folderTargets, group.targetFolderPath.toLowerCase(), group.path, folderWarnings);
    group.warnings = folderWarnings;
    group.status = folderWarnings.length ? "warning" : group.status;

    for (const file of group.files) {
      const fileWarnings = [];
      if (hasInvalidName(file.targetName)) fileWarnings.push("目标文件名包含非法字符 / Invalid file name.");
      addTarget(fileTargets, file.targetPath.toLowerCase(), file.path, fileWarnings);
      file.warnings = fileWarnings;
      file.status = fileWarnings.length ? "warning" : file.status;
    }
  }

  return scan;
}

function addTarget(targets, targetPath, sourcePath, warnings) {
  const existing = targets.get(targetPath);
  if (existing && existing !== sourcePath) {
    warnings.push("目标名称重复 / Duplicate target name.");
  }
  targets.set(targetPath, sourcePath);
}

function hasInvalidName(name) {
  return /[\\/:*?"<>|]/.test(name) || !name.trim();
}

async function applyRenamePlan(payload, sender) {
  const operations = payload.operations || [];
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("没有可执行的重命名计划 / No rename operations.");
  }

  const applied = [];
  const skipped = [];
  const prepared = await prepareOperations(operations);
  skipped.push(...prepared.skipped);
  const ordered = orderOperations(prepared.runnable);
  try {
    for (const [index, operation] of ordered.entries()) {
      sendProgress(sender, {
        phase: "apply",
        current: index + 1,
        total: ordered.length,
        label: path.basename(operation.to),
      });
      if (operation.from === operation.to) continue;
      try {
        await fs.rename(operation.from, operation.to);
        applied.push(operation);
      } catch (error) {
        if (error && (error.code === "EEXIST" || error.code === "ENOTEMPTY")) {
          skipped.push({ operation, reason: "目标已存在，已跳过 / Target exists, skipped." });
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    lastRenameLog = { createdAt: new Date().toISOString(), operations: applied, skipped };
    throw error;
  }

  lastRenameLog = { createdAt: new Date().toISOString(), operations: applied, skipped };
  sendProgress(sender, { phase: "complete", current: applied.length, total: ordered.length, label: "执行完成 / Apply complete" });
  return lastRenameLog;
}

function sendProgress(sender, progress) {
  if (!sender || sender.isDestroyed()) return;
  sender.send("renamer:progress", progress);
}

async function prepareOperations(operations) {
  const targetSet = new Set();
  const runnable = [];
  const skipped = [];
  for (const operation of operations) {
    if (!operation.from || !operation.to || operation.from === operation.to) continue;
    const baseName = path.basename(operation.to);
    if (hasInvalidName(baseName)) {
      skipped.push({ operation, reason: `目标名称非法 / Invalid target name: ${baseName}` });
      continue;
    }
    const key = operation.to.toLowerCase();
    if (targetSet.has(key)) {
      skipped.push({ operation, reason: `目标名称重复 / Duplicate target: ${operation.to}` });
      continue;
    }
    targetSet.add(key);
    try {
      await fs.access(operation.to);
      if (operation.from.toLowerCase() !== operation.to.toLowerCase()) {
        skipped.push({ operation, reason: `目标已存在 / Target already exists: ${operation.to}` });
        continue;
      }
    } catch (error) {
      if (error && error.code !== "ENOENT") {
        skipped.push({ operation, reason: error.message || "目标检查失败 / Target check failed." });
        continue;
      }
    }
    runnable.push(operation);
  }
  return { runnable, skipped };
}

function orderOperations(operations) {
  return [...operations].sort((a, b) => {
    if (a.kind === b.kind && a.kind === "folder") {
      return b.from.length - a.from.length;
    }
    if (a.kind === "file" && b.kind === "folder") return -1;
    if (a.kind === "folder" && b.kind === "file") return 1;
    return a.from.localeCompare(b.from);
  });
}

async function undoLastRename() {
  if (!lastRenameLog || lastRenameLog.operations.length === 0) {
    throw new Error("没有可撤销的操作 / Nothing to undo.");
  }
  const reversed = [...lastRenameLog.operations].reverse();
  for (const operation of reversed) {
    await fs.rename(operation.to, operation.from);
  }
  const undone = lastRenameLog;
  lastRenameLog = null;
  return undone;
}

async function exportLog(payload) {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: `smart-renamer-log-${Date.now()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), "utf8");
  return result.filePath;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
