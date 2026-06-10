import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, FolderOpen, Play, RotateCcw, ScanLine, Wand2 } from "lucide-react";
import {
  buildCleanupOperations,
  defaultCleanupOptions,
  findNoiseCandidates,
  getCleanupError,
  type CleanupAction,
  type CleanupOptions,
} from "./cleanup";
import { getRenamerApi } from "./api";
import type { ProgressState, RenameLog, RenameOperation, ScanGroup, ScanResult, SortMode } from "./types";
import { createRoot } from "react-dom/client";
import "./styles.css";

const statusLabel = {
  ready: "就绪 / Ready",
  warning: "警告 / Warning",
  unchanged: "无变化 / Unchanged",
};

const idleProgress: ProgressState = {
  phase: "idle",
  current: 0,
  total: 0,
  label: "",
};

const cleanupActions: CleanupAction[] = ["text-remove", "smart-rule", "regex-remove", "replace", "add", "trim", "noise"];
const cleanupLabels: Record<CleanupAction, string> = {
  "text-remove": "删除文本 / Remove text",
  "smart-rule": "智能规则删除 / Smart rule",
  "regex-remove": "高级正则删除 / Regex",
  replace: "替换内容 / Replace",
  add: "添加前后缀 / Add text",
  trim: "删除首尾空格 / Trim spaces",
  noise: "无用内容推荐 / Noise cleanup",
};

function App() {
  const [rootPath, setRootPath] = useState("");
  const [personName, setPersonName] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("natural");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [cleanup, setCleanup] = useState<CleanupOptions>(defaultCleanupOptions);
  const [themeOverrides, setThemeOverrides] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("请选择根文件夹；人物名称只在文件夹前缀清理时需要 / Select a root folder. Person name is only needed for folder prefix cleanup.");
  const [lastLog, setLastLog] = useState<RenameLog | null>(null);
  const [progress, setProgress] = useState<ProgressState>(idleProgress);
  const api = useMemo(() => getRenamerApi(), []);

  const selectedGroup = scan?.groups.find((group) => group.id === selectedId) || scan?.groups[0] || null;
  const folderOps = useMemo(() => buildFolderOperations(scan?.groups || []), [scan]);
  const fileOps = useMemo(() => buildFileOperations(scan?.groups || []), [scan]);
  const cleanupActionOps = useMemo(
    () => Object.fromEntries(cleanupActions.map((action) => [action, buildCleanupOperations(scan?.groups || [], cleanup, action)])) as Record<CleanupAction, RenameOperation[]>,
    [scan, cleanup],
  );
  const cleanupOps = useMemo(() => cleanupActions.flatMap((action) => cleanupActionOps[action]), [cleanupActionOps]);
  const noiseCandidates = useMemo(() => findNoiseCandidates(scan?.groups || []), [scan]);
  const regexError = useMemo(() => getCleanupError(cleanup, "regex-remove"), [cleanup]);
  const warnings = useMemo(() => countWarnings(scan?.groups || []), [scan]);
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  useEffect(() => {
    if (!api.onProgress) return undefined;
    return api.onProgress((nextProgress) => setProgress(nextProgress));
  }, [api]);

  async function chooseFolder() {
    const folder = await api.selectFolder();
    if (folder) setRootPath(folder);
  }

  async function runScan() {
    if (!rootPath) {
      setMessage("请先选择根文件夹 / Choose a root folder first.");
      return;
    }
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: 0, label: "正在扫描 / Scanning..." });
    try {
      const result = await api.scan({ rootPath, personName, sortMode });
      setScan(result);
      setThemeOverrides(Object.fromEntries(result.groups.map((group) => [group.id, group.theme])));
      setSelectedId(result.groups[0]?.id || "");
      setMessage(`扫描完成：${result.groups.length}个子文件夹 / Scan complete: ${result.groups.length} folders.`);
      setProgress({ phase: "complete", current: result.groups.length, total: result.groups.length, label: "扫描完成 / Scan complete" });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyOperations(operations: RenameOperation[], label: string) {
    if (!operations.length) {
      setMessage("没有需要执行的项目 / Nothing to apply.");
      return;
    }
    const runnableOperations = operations.filter((operation) => operation.from !== operation.to);
    if (!runnableOperations.length) {
      setMessage("没有需要执行的有效项目 / No runnable operations.");
      return;
    }
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: runnableOperations.length, label: `${label}...` });
    try {
      const log = await api.apply({ operations: runnableOperations });
      setLastLog(log);
      const skipped = log.skipped?.length || 0;
      setMessage(`${label}完成：${log.operations.length}项，跳过${skipped}项 / ${label} complete: ${log.operations.length}, skipped: ${skipped}.`);
      setProgress({ phase: "complete", current: log.operations.length, total: runnableOperations.length, label: "执行完成 / Apply complete" });
      await runScan();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: 0, label: "正在撤销 / Undoing..." });
    try {
      const log = await api.undo();
      setLastLog(null);
      setMessage(`已撤销：${log.operations.length}项 / Undo complete.`);
      setProgress({ phase: "complete", current: log.operations.length, total: log.operations.length, label: "撤销完成 / Undo complete" });
      await runScan();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function exportLog() {
    const payload = { scan, lastLog, folderOps, fileOps, cleanupActionOps, exportedAt: new Date().toISOString() };
    const filePath = await api.exportLog(payload);
    if (filePath) setMessage(`日志已导出 / Log exported: ${filePath}`);
  }

  function toggleNoiseText(text: string) {
    const selected = cleanup.selectedNoiseTexts.includes(text)
      ? cleanup.selectedNoiseTexts.filter((item) => item !== text)
      : [...cleanup.selectedNoiseTexts, text];
    setCleanup({ ...cleanup, selectedNoiseTexts: selected });
  }

  function renderCleanupPreview(action: CleanupAction) {
    const operations = cleanupActionOps[action];
    if (action === "regex-remove" && regexError) {
      return <p className="cleanup-error">正则表达式错误 / Regex error: {regexError}</p>;
    }
    if (!operations.length) {
      return <p className="cleanup-empty">没有可预览的变化 / No changes to preview.</p>;
    }
    return (
      <div className="cleanup-preview-list">
        {operations.slice(0, 5).map((operation) => (
          <span key={operation.from}>{operation.label}</span>
        ))}
        {operations.length > 5 ? <em>还有{operations.length - 5}项 / more</em> : null}
      </div>
    );
  }

  function cleanupButton(action: CleanupAction) {
    const operations = cleanupActionOps[action];
    return (
      <button onClick={() => applyOperations(operations, cleanupLabels[action])} disabled={busy || !operations.length || (action === "regex-remove" && Boolean(regexError))}>
        <Wand2 size={16} />
        执行 / Apply
      </button>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Smart Renamer / 智能重命名</h1>
          <p>离线批量整理人物目录下的图片和视频 / Offline media folder organizer</p>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={chooseFolder} title="选择文件夹 / Select folder">
            <FolderOpen size={18} />
          </button>
          <button className="primary" onClick={runScan} disabled={busy}>
            <ScanLine size={16} />
            扫描 / Scan
          </button>
        </div>
      </header>

      <section className="control-band">
        <label>
          根文件夹 / Root folder
          <input value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="E:\\Media\\张三" />
        </label>
        <label>
          人物名称 / Person
          <input value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="可选，用于文件夹前缀 / Optional" />
        </label>
        <label>
          排序 / Sorting
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="natural">文件名自然排序 / Natural</option>
            <option value="modified">修改时间 / Modified time</option>
            <option value="created">创建时间 / Created time</option>
          </select>
        </label>
      </section>

      <section className="status-strip">
        <span>{message}</span>
        <strong>{scan ? `${scan.groups.length} folders / 文件夹` : "No scan / 未扫描"}</strong>
        <strong>{folderOps.length} folder ops / 文件夹操作</strong>
        <strong>{fileOps.length} file ops / 文件操作</strong>
        <strong className={warnings ? "warn" : "ok"}>{warnings} warnings / 警告</strong>
      </section>

      <section className={`progress-panel ${busy || progress.phase !== "idle" ? "visible" : ""}`}>
        <div className="progress-meta">
          <strong>{progress.label || "等待操作 / Idle"}</strong>
          <span>{progress.total > 0 ? `${progress.current}/${progress.total} (${progressPercent}%)` : busy ? "处理中 / Working" : "Ready"}</span>
        </div>
        <div className={`progress-track ${progress.total > 0 ? "" : "indeterminate"}`}>
          <div className="progress-fill" style={{ width: progress.total > 0 ? `${Math.min(progressPercent, 100)}%` : "34%" }} />
        </div>
      </section>

      <section className="workspace">
        <div className="panel list-panel">
          <div className="panel-heading">
            <h2>文件夹预览 / Folder Preview</h2>
            <span>{statusLabel[selectedGroup?.status || "unchanged"]}</span>
          </div>
          <div className="table folder-table">
            <div className="table-head">
              <span>原名称 / Original</span>
              <span>主题 / Theme</span>
              <span>统计 / Stats</span>
              <span>目标 / Target</span>
            </div>
            <div className="table-body">
              {(scan?.groups || []).map((group) => (
                <button
                  key={group.id}
                  className={`row-button ${selectedGroup?.id === group.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(group.id)}
                >
                  <span style={{ paddingLeft: `${Math.max(group.depth - 1, 0) * 16}px` }}>{group.originalName}</span>
                  <span>{group.theme}</span>
                  <span>{group.folderStats.suffix || "无媒体 / No media"}</span>
                  <span>{group.targetFolderName}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="panel inspector">
          <div className="panel-heading">
            <h2>详情 / Inspector</h2>
            <Wand2 size={18} />
          </div>
          {selectedGroup ? (
            <>
              <div className="info-grid">
                <span>路径 / Path</span>
                <b>{selectedGroup.path}</b>
                <span>主题 / Theme</span>
                <b>{themeOverrides[selectedGroup.id] || selectedGroup.theme}</b>
                <span>图片 / Photos</span>
                <b>{selectedGroup.folderStats.imageCount}P</b>
                <span>视频 / Videos</span>
                <b>{selectedGroup.folderStats.videoCount}V</b>
                <span>文件 / Files</span>
                <b>{selectedGroup.files.length}</b>
              </div>
              <div className="warnings">
                {selectedGroup.warnings.length ? selectedGroup.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>无警告 / No warnings</p>}
              </div>
              <label className="stacked-label">
                修正主题 / Edit theme
                <input
                  value={themeOverrides[selectedGroup.id] || selectedGroup.theme}
                  onChange={(event) => setThemeOverrides({ ...themeOverrides, [selectedGroup.id]: event.target.value })}
                />
              </label>
              <h3>当前层文件预览 / Direct File Preview</h3>
              <div className="mini-list">
                {selectedGroup.files.slice(0, 8).map((file) => (
                  <div key={file.path}>
                    <span>{file.name}</span>
                    <strong>{file.targetName}</strong>
                  </div>
                ))}
                {selectedGroup.files.length > 8 ? <em>还有{selectedGroup.files.length - 8}项 / more items</em> : null}
              </div>
            </>
          ) : (
            <p className="empty">扫描后选择一个文件夹 / Scan and select a folder.</p>
          )}
        </aside>
      </section>

      <section className="cleanup-panel">
        <div className="panel-heading">
          <h2>文件夹名称清理 / Folder Name Cleanup</h2>
          <span>{cleanupOps.length} ops / 独立清理操作</span>
        </div>
        <div className="cleanup-cards">
          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>普通文本删除 / Remove Text</h3>
              <strong>{cleanupActionOps["text-remove"].length} ops</strong>
            </div>
            <label>
              要删除的固定文本 / Text
              <input value={cleanup.removeText} onChange={(event) => setCleanup({ ...cleanup, removeText: event.target.value })} placeholder="DJAWA" />
            </label>
            {renderCleanupPreview("text-remove")}
            {cleanupButton("text-remove")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>智能规则删除 / Smart Rule</h3>
              <strong>{cleanupActionOps["smart-rule"].length} ops</strong>
            </div>
            <label>
              选择规则 / Rule
              <select value={cleanup.smartRule} onChange={(event) => setCleanup({ ...cleanup, smartRule: event.target.value as CleanupOptions["smartRule"] })}>
                <option value="leading-number">删除开头编号，例如048 ARTGRAVIA...</option>
                <option value="photo-vol">删除Photo Vol编号，例如DJAWA Photo Vol 0216</option>
                <option value="vol-number">删除Vol编号，例如Vol 0216</option>
                <option value="middle-number">删除中间孤立编号，例如 - 048 ARTGRAVIA</option>
                <option value="brand-word">删除指定品牌词，例如DJAWA、BLUECAKE</option>
              </select>
            </label>
            {cleanup.smartRule === "brand-word" ? (
              <label>
                品牌词 / Brand word
                <input value={cleanup.smartBrandText} onChange={(event) => setCleanup({ ...cleanup, smartBrandText: event.target.value })} placeholder="DJAWA" />
              </label>
            ) : null}
            {renderCleanupPreview("smart-rule")}
            {cleanupButton("smart-rule")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>高级正则删除 / Advanced Regex</h3>
              <strong>{cleanupActionOps["regex-remove"].length} ops</strong>
            </div>
            <label>
              正则表达式 / Pattern
              <input value={cleanup.regexRemovePattern} onChange={(event) => setCleanup({ ...cleanup, regexRemovePattern: event.target.value })} placeholder="DJAWA Photo Vol \\d+" />
            </label>
            <div className="regex-examples">
              {["DJAWA Photo Vol \\d+", "^\\d{2,4}\\s+", "\\s+-\\s+\\d{2,4}\\s+"].map((pattern) => (
                <button key={pattern} type="button" onClick={() => setCleanup({ ...cleanup, regexRemovePattern: pattern })}>
                  {pattern}
                </button>
              ))}
            </div>
            <label className="check-row compact">
              <input type="checkbox" checked={cleanup.regexCaseSensitive} onChange={(event) => setCleanup({ ...cleanup, regexCaseSensitive: event.target.checked })} />
              区分大小写 / Case sensitive
            </label>
            <p className="hint">\\d+表示数字，^表示开头，\\s+表示空格。不会正则时请优先用智能规则。</p>
            {renderCleanupPreview("regex-remove")}
            {cleanupButton("regex-remove")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>替换内容 / Replace</h3>
              <strong>{cleanupActionOps.replace.length} ops</strong>
            </div>
            <label>
              查找 / Find
              <input value={cleanup.replaceFrom} onChange={(event) => setCleanup({ ...cleanup, replaceFrom: event.target.value })} />
            </label>
            <label>
              替换为 / Replace with
              <input value={cleanup.replaceTo} onChange={(event) => setCleanup({ ...cleanup, replaceTo: event.target.value })} />
            </label>
            <label className="check-row compact">
              <input type="checkbox" checked={cleanup.replaceCaseSensitive} onChange={(event) => setCleanup({ ...cleanup, replaceCaseSensitive: event.target.checked })} />
              区分大小写 / Case sensitive
            </label>
            {renderCleanupPreview("replace")}
            {cleanupButton("replace")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>添加前后缀 / Add Text</h3>
              <strong>{cleanupActionOps.add.length} ops</strong>
            </div>
            <label>
              添加内容 / Text
              <input value={cleanup.addText} onChange={(event) => setCleanup({ ...cleanup, addText: event.target.value })} />
            </label>
            <label>
              添加位置 / Position
              <select value={cleanup.addPosition} onChange={(event) => setCleanup({ ...cleanup, addPosition: event.target.value as "prefix" | "suffix" })}>
                <option value="prefix">前缀 / Prefix</option>
                <option value="suffix">后缀 / Suffix</option>
              </select>
            </label>
            {renderCleanupPreview("add")}
            {cleanupButton("add")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>删除首尾空格 / Trim Spaces</h3>
              <strong>{cleanupActionOps.trim.length} ops</strong>
            </div>
            <label className="check-row compact">
              <input type="checkbox" checked={cleanup.trimOuterSpaces} onChange={(event) => setCleanup({ ...cleanup, trimOuterSpaces: event.target.checked })} />
              只删除文件夹名称开头和结尾的空白 / Trim outer spaces only
            </label>
            {renderCleanupPreview("trim")}
            {cleanupButton("trim")}
          </article>

          <article className="cleanup-card wide">
            <div className="cleanup-card-head">
              <h3>无用内容推荐 / Suggested Noise</h3>
              <strong>{cleanupActionOps.noise.length} ops</strong>
            </div>
            <div className="noise-list">
              {noiseCandidates.length ? (
                noiseCandidates.map((candidate) => (
                  <label key={candidate.id} className="noise-option">
                    <input type="checkbox" checked={cleanup.selectedNoiseTexts.includes(candidate.text)} onChange={() => toggleNoiseText(candidate.text)} />
                    <span>
                      <b>{candidate.text}</b>
                      <em>{candidate.reason} · {candidate.count}项 · 示例：{candidate.example}</em>
                    </span>
                  </label>
                ))
              ) : (
                <p className="cleanup-empty">扫描后会推荐DJAWA Photo Vol编号、开头048这类疑似无用内容。</p>
              )}
            </div>
            {renderCleanupPreview("noise")}
            {cleanupButton("noise")}
          </article>
        </div>
      </section>

      <footer className="command-bar">
        <button onClick={() => applyOperations(folderOps, "重命名文件夹 / Rename folders")} disabled={busy || !folderOps.length}>
          <CheckCircle2 size={16} />
          重命名文件夹 / Rename folders
        </button>
        <button onClick={() => applyOperations(fileOps, "重命名文件 / Rename files")} disabled={busy || !fileOps.length}>
          <Play size={16} />
          重命名文件 / Rename files
        </button>
        <button onClick={undo} disabled={busy || !lastLog}>
          <RotateCcw size={16} />
          撤销上次 / Undo last
        </button>
        <button onClick={exportLog} disabled={busy || !scan}>
          <Download size={16} />
          导出日志 / Export log
        </button>
      </footer>
    </main>
  );
}

function buildFolderOperations(groups: ScanGroup[]): RenameOperation[] {
  return groups
    .filter((group) => group.originalName !== group.targetFolderName)
    .map((group) => ({
      kind: "folder",
      from: group.path,
      to: group.targetFolderPath,
      label: `${group.originalName} -> ${group.targetFolderName}`,
    }));
}

function buildFileOperations(groups: ScanGroup[]): RenameOperation[] {
  return groups.flatMap((group) =>
    group.files
      .filter((file) => file.name !== file.targetName)
      .filter((file) => file.targetName.trim())
      .map((file) => ({
        kind: "file" as const,
        from: file.path,
        to: replaceBaseName(file.path, file.targetName),
        label: `${file.name} -> ${file.targetName}`,
      })),
  );
}

function replaceBaseName(filePath: string, baseName: string) {
  const separator = filePath.includes("/") && !filePath.includes("\\") ? "/" : "\\";
  return `${filePath.slice(0, Math.max(filePath.lastIndexOf("\\"), filePath.lastIndexOf("/")))}${separator}${baseName}`;
}

function countWarnings(groups: ScanGroup[]) {
  return groups.reduce((sum, group) => sum + group.warnings.length + group.files.reduce((fileSum, file) => fileSum + file.warnings.length, 0), 0);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
