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
  ready: "å°±ç»ª / Ready",
  warning: "è­¦å‘Š / Warning",
  unchanged: "æ— å˜åŒ– / Unchanged",
};

const idleProgress: ProgressState = {
  phase: "idle",
  current: 0,
  total: 0,
  label: "",
};

const cleanupActions: CleanupAction[] = ["text-remove", "smart-rule", "regex-remove", "replace", "add", "trim", "noise"];
const cleanupLabels: Record<CleanupAction, string> = {
  "text-remove": "åˆ é™¤æ–‡æœ¬ / Remove text",
  "smart-rule": "æ™ºèƒ½è§„åˆ™åˆ é™¤ / Smart rule",
  "regex-remove": "é«˜çº§æ­£åˆ™åˆ é™¤ / Regex",
  replace: "æ›¿æ¢å†…å®¹ / Replace",
  add: "æ·»åŠ å‰åŽç¼€ / Add text",
  trim: "åˆ é™¤é¦–å°¾ç©ºæ ¼ / Trim spaces",
  noise: "æ— ç”¨å†…å®¹æŽ¨è / Noise cleanup",
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
  const [message, setMessage] = useState("è¯·é€‰æ‹©æ ¹æ–‡ä»¶å¤¹ï¼›äººç‰©åç§°åªåœ¨æ–‡ä»¶å¤¹å‰ç¼€æ¸…ç†æ—¶éœ€è¦ / Select a root folder. Person name is only needed for folder prefix cleanup.");
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
      setMessage("è¯·å…ˆé€‰æ‹©æ ¹æ–‡ä»¶å¤¹ / Choose a root folder first.");
      return;
    }
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: 0, label: "æ­£åœ¨æ‰«æ / Scanning..." });
    try {
      const result = await api.scan({ rootPath, personName, sortMode });
      setScan(result);
      setThemeOverrides(Object.fromEntries(result.groups.map((group) => [group.id, group.theme])));
      setSelectedId(result.groups[0]?.id || "");
      setMessage(`æ‰«æå®Œæˆï¼š${result.groups.length}ä¸ªå­æ–‡ä»¶å¤¹ / Scan complete: ${result.groups.length} folders.`);
      setProgress({ phase: "complete", current: result.groups.length, total: result.groups.length, label: "æ‰«æå®Œæˆ / Scan complete" });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyOperations(operations: RenameOperation[], label: string) {
    if (!operations.length) {
      setMessage("æ²¡æœ‰éœ€è¦æ‰§è¡Œçš„é¡¹ç›® / Nothing to apply.");
      return;
    }
    const runnableOperations = operations.filter((operation) => operation.from !== operation.to);
    if (!runnableOperations.length) {
      setMessage("æ²¡æœ‰éœ€è¦æ‰§è¡Œçš„æœ‰æ•ˆé¡¹ç›® / No runnable operations.");
      return;
    }
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: runnableOperations.length, label: `${label}...` });
    try {
      const log = await api.apply({ operations: runnableOperations });
      setLastLog(log);
      const skipped = log.skipped?.length || 0;
      setMessage(`${label}å®Œæˆï¼š${log.operations.length}é¡¹ï¼Œè·³è¿‡${skipped}é¡¹ / ${label} complete: ${log.operations.length}, skipped: ${skipped}.`);
      setProgress({ phase: "complete", current: log.operations.length, total: runnableOperations.length, label: "æ‰§è¡Œå®Œæˆ / Apply complete" });
      await runScan();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: 0, label: "æ­£åœ¨æ’¤é”€ / Undoing..." });
    try {
      const log = await api.undo();
      setLastLog(null);
      setMessage(`å·²æ’¤é”€ï¼š${log.operations.length}é¡¹ / Undo complete.`);
      setProgress({ phase: "complete", current: log.operations.length, total: log.operations.length, label: "æ’¤é”€å®Œæˆ / Undo complete" });
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
    if (filePath) setMessage(`æ—¥å¿—å·²å¯¼å‡º / Log exported: ${filePath}`);
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
      return <p className="cleanup-error">æ­£åˆ™è¡¨è¾¾å¼é”™è¯¯ / Regex error: {regexError}</p>;
    }
    if (!operations.length) {
      return <p className="cleanup-empty">æ²¡æœ‰å¯é¢„è§ˆçš„å˜åŒ– / No changes to preview.</p>;
    }
    return (
      <div className="cleanup-preview-list">
        {operations.slice(0, 5).map((operation) => (
          <span key={operation.from}>{operation.label}</span>
        ))}
        {operations.length > 5 ? <em>è¿˜æœ‰{operations.length - 5}é¡¹ / more</em> : null}
      </div>
    );
  }

  function cleanupButton(action: CleanupAction) {
    const operations = cleanupActionOps[action];
    return (
      <button onClick={() => applyOperations(operations, cleanupLabels[action])} disabled={busy || !operations.length || (action === "regex-remove" && Boolean(regexError))}>
        <Wand2 size={16} />
        æ‰§è¡Œ / Apply
      </button>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>werenameit / Unreleased</h1>
          <p>ç¦»çº¿æ‰¹é‡æ•´ç†äººç‰©ç›®å½•ä¸‹çš„å›¾ç‰‡å’Œè§†é¢‘ / Offline media folder organizer</p>
        </div>
        <div className="top-actions">
          <button className="icon-button" onClick={chooseFolder} title="é€‰æ‹©æ–‡ä»¶å¤¹ / Select folder">
            <FolderOpen size={18} />
          </button>
          <button className="primary" onClick={runScan} disabled={busy}>
            <ScanLine size={16} />
            æ‰«æ / Scan
          </button>
        </div>
      </header>

      <section className="control-band">
        <label>
          æ ¹æ–‡ä»¶å¤¹ / Root folder
          <input value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="E:\\Media\\å¼ ä¸‰" />
        </label>
        <label>
          äººç‰©åç§° / Person
          <input value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="å¯é€‰ï¼Œç”¨äºŽæ–‡ä»¶å¤¹å‰ç¼€ / Optional" />
        </label>
        <label>
          æŽ’åº / Sorting
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="natural">æ–‡ä»¶åè‡ªç„¶æŽ’åº / Natural</option>
            <option value="modified">ä¿®æ”¹æ—¶é—´ / Modified time</option>
            <option value="created">åˆ›å»ºæ—¶é—´ / Created time</option>
          </select>
        </label>
      </section>

      <section className="status-strip">
        <span>{message}</span>
        <strong>{scan ? `${scan.groups.length} folders / æ–‡ä»¶å¤¹` : "No scan / æœªæ‰«æ"}</strong>
        <strong>{folderOps.length} folder ops / æ–‡ä»¶å¤¹æ“ä½œ</strong>
        <strong>{fileOps.length} file ops / æ–‡ä»¶æ“ä½œ</strong>
        <strong className={warnings ? "warn" : "ok"}>{warnings} warnings / è­¦å‘Š</strong>
      </section>

      <section className={`progress-panel ${busy || progress.phase !== "idle" ? "visible" : ""}`}>
        <div className="progress-meta">
          <strong>{progress.label || "ç­‰å¾…æ“ä½œ / Idle"}</strong>
          <span>{progress.total > 0 ? `${progress.current}/${progress.total} (${progressPercent}%)` : busy ? "å¤„ç†ä¸­ / Working" : "Ready"}</span>
        </div>
        <div className={`progress-track ${progress.total > 0 ? "" : "indeterminate"}`}>
          <div className="progress-fill" style={{ width: progress.total > 0 ? `${Math.min(progressPercent, 100)}%` : "34%" }} />
        </div>
      </section>

      <section className="workspace">
        <div className="panel list-panel">
          <div className="panel-heading">
            <h2>æ–‡ä»¶å¤¹é¢„è§ˆ / Folder Preview</h2>
            <span>{statusLabel[selectedGroup?.status || "unchanged"]}</span>
          </div>
          <div className="table folder-table">
            <div className="table-head">
              <span>åŽŸåç§° / Original</span>
              <span>ä¸»é¢˜ / Theme</span>
              <span>ç»Ÿè®¡ / Stats</span>
              <span>ç›®æ ‡ / Target</span>
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
                  <span>{group.folderStats.suffix || "æ— åª’ä½“ / No media"}</span>
                  <span>{group.targetFolderName}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <aside className="panel inspector">
          <div className="panel-heading">
            <h2>è¯¦æƒ… / Inspector</h2>
            <Wand2 size={18} />
          </div>
          {selectedGroup ? (
            <>
              <div className="info-grid">
                <span>è·¯å¾„ / Path</span>
                <b>{selectedGroup.path}</b>
                <span>ä¸»é¢˜ / Theme</span>
                <b>{themeOverrides[selectedGroup.id] || selectedGroup.theme}</b>
                <span>å›¾ç‰‡ / Photos</span>
                <b>{selectedGroup.folderStats.imageCount}P</b>
                <span>è§†é¢‘ / Videos</span>
                <b>{selectedGroup.folderStats.videoCount}V</b>
                <span>æ–‡ä»¶ / Files</span>
                <b>{selectedGroup.files.length}</b>
              </div>
              <div className="warnings">
                {selectedGroup.warnings.length ? selectedGroup.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>æ— è­¦å‘Š / No warnings</p>}
              </div>
              <label className="stacked-label">
                ä¿®æ­£ä¸»é¢˜ / Edit theme
                <input
                  value={themeOverrides[selectedGroup.id] || selectedGroup.theme}
                  onChange={(event) => setThemeOverrides({ ...themeOverrides, [selectedGroup.id]: event.target.value })}
                />
              </label>
              <h3>å½“å‰å±‚æ–‡ä»¶é¢„è§ˆ / Direct File Preview</h3>
              <div className="mini-list">
                {selectedGroup.files.slice(0, 8).map((file) => (
                  <div key={file.path}>
                    <span>{file.name}</span>
                    <strong>{file.targetName}</strong>
                  </div>
                ))}
                {selectedGroup.files.length > 8 ? <em>è¿˜æœ‰{selectedGroup.files.length - 8}é¡¹ / more items</em> : null}
              </div>
            </>
          ) : (
            <p className="empty">æ‰«æåŽé€‰æ‹©ä¸€ä¸ªæ–‡ä»¶å¤¹ / Scan and select a folder.</p>
          )}
        </aside>
      </section>

      <section className="cleanup-panel">
        <div className="panel-heading">
          <h2>æ–‡ä»¶å¤¹åç§°æ¸…ç† / Folder Name Cleanup</h2>
          <span>{cleanupOps.length} ops / ç‹¬ç«‹æ¸…ç†æ“ä½œ</span>
        </div>
        <div className="cleanup-cards">
          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>æ™®é€šæ–‡æœ¬åˆ é™¤ / Remove Text</h3>
              <strong>{cleanupActionOps["text-remove"].length} ops</strong>
            </div>
            <label>
              è¦åˆ é™¤çš„å›ºå®šæ–‡æœ¬ / Text
              <input value={cleanup.removeText} onChange={(event) => setCleanup({ ...cleanup, removeText: event.target.value })} placeholder="DJAWA" />
            </label>
            {renderCleanupPreview("text-remove")}
            {cleanupButton("text-remove")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>æ™ºèƒ½è§„åˆ™åˆ é™¤ / Smart Rule</h3>
              <strong>{cleanupActionOps["smart-rule"].length} ops</strong>
            </div>
            <label>
              é€‰æ‹©è§„åˆ™ / Rule
              <select value={cleanup.smartRule} onChange={(event) => setCleanup({ ...cleanup, smartRule: event.target.value as CleanupOptions["smartRule"] })}>
                <option value="leading-number">åˆ é™¤å¼€å¤´ç¼–å·ï¼Œä¾‹å¦‚048 ARTGRAVIA...</option>
                <option value="photo-vol">åˆ é™¤Photo Volç¼–å·ï¼Œä¾‹å¦‚DJAWA Photo Vol 0216</option>
                <option value="vol-number">åˆ é™¤Volç¼–å·ï¼Œä¾‹å¦‚Vol 0216</option>
                <option value="middle-number">åˆ é™¤ä¸­é—´å­¤ç«‹ç¼–å·ï¼Œä¾‹å¦‚ - 048 ARTGRAVIA</option>
                <option value="brand-word">åˆ é™¤æŒ‡å®šå“ç‰Œè¯ï¼Œä¾‹å¦‚DJAWAã€BLUECAKE</option>
              </select>
            </label>
            {cleanup.smartRule === "brand-word" ? (
              <label>
                å“ç‰Œè¯ / Brand word
                <input value={cleanup.smartBrandText} onChange={(event) => setCleanup({ ...cleanup, smartBrandText: event.target.value })} placeholder="DJAWA" />
              </label>
            ) : null}
            {renderCleanupPreview("smart-rule")}
            {cleanupButton("smart-rule")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>é«˜çº§æ­£åˆ™åˆ é™¤ / Advanced Regex</h3>
              <strong>{cleanupActionOps["regex-remove"].length} ops</strong>
            </div>
            <label>
              æ­£åˆ™è¡¨è¾¾å¼ / Pattern
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
              åŒºåˆ†å¤§å°å†™ / Case sensitive
            </label>
            <p className="hint">\\d+è¡¨ç¤ºæ•°å­—ï¼Œ^è¡¨ç¤ºå¼€å¤´ï¼Œ\\s+è¡¨ç¤ºç©ºæ ¼ã€‚ä¸ä¼šæ­£åˆ™æ—¶è¯·ä¼˜å…ˆç”¨æ™ºèƒ½è§„åˆ™ã€‚</p>
            {renderCleanupPreview("regex-remove")}
            {cleanupButton("regex-remove")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>æ›¿æ¢å†…å®¹ / Replace</h3>
              <strong>{cleanupActionOps.replace.length} ops</strong>
            </div>
            <label>
              æŸ¥æ‰¾ / Find
              <input value={cleanup.replaceFrom} onChange={(event) => setCleanup({ ...cleanup, replaceFrom: event.target.value })} />
            </label>
            <label>
              æ›¿æ¢ä¸º / Replace with
              <input value={cleanup.replaceTo} onChange={(event) => setCleanup({ ...cleanup, replaceTo: event.target.value })} />
            </label>
            <label className="check-row compact">
              <input type="checkbox" checked={cleanup.replaceCaseSensitive} onChange={(event) => setCleanup({ ...cleanup, replaceCaseSensitive: event.target.checked })} />
              åŒºåˆ†å¤§å°å†™ / Case sensitive
            </label>
            {renderCleanupPreview("replace")}
            {cleanupButton("replace")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>æ·»åŠ å‰åŽç¼€ / Add Text</h3>
              <strong>{cleanupActionOps.add.length} ops</strong>
            </div>
            <label>
              æ·»åŠ å†…å®¹ / Text
              <input value={cleanup.addText} onChange={(event) => setCleanup({ ...cleanup, addText: event.target.value })} />
            </label>
            <label>
              æ·»åŠ ä½ç½® / Position
              <select value={cleanup.addPosition} onChange={(event) => setCleanup({ ...cleanup, addPosition: event.target.value as "prefix" | "suffix" })}>
                <option value="prefix">å‰ç¼€ / Prefix</option>
                <option value="suffix">åŽç¼€ / Suffix</option>
              </select>
            </label>
            {renderCleanupPreview("add")}
            {cleanupButton("add")}
          </article>

          <article className="cleanup-card">
            <div className="cleanup-card-head">
              <h3>åˆ é™¤é¦–å°¾ç©ºæ ¼ / Trim Spaces</h3>
              <strong>{cleanupActionOps.trim.length} ops</strong>
            </div>
            <label className="check-row compact">
              <input type="checkbox" checked={cleanup.trimOuterSpaces} onChange={(event) => setCleanup({ ...cleanup, trimOuterSpaces: event.target.checked })} />
              åªåˆ é™¤æ–‡ä»¶å¤¹åç§°å¼€å¤´å’Œç»“å°¾çš„ç©ºç™½ / Trim outer spaces only
            </label>
            {renderCleanupPreview("trim")}
            {cleanupButton("trim")}
          </article>

          <article className="cleanup-card wide">
            <div className="cleanup-card-head">
              <h3>æ— ç”¨å†…å®¹æŽ¨è / Suggested Noise</h3>
              <strong>{cleanupActionOps.noise.length} ops</strong>
            </div>
            <div className="noise-list">
              {noiseCandidates.length ? (
                noiseCandidates.map((candidate) => (
                  <label key={candidate.id} className="noise-option">
                    <input type="checkbox" checked={cleanup.selectedNoiseTexts.includes(candidate.text)} onChange={() => toggleNoiseText(candidate.text)} />
                    <span>
                      <b>{candidate.text}</b>
                      <em>{candidate.reason} Â· {candidate.count}é¡¹ Â· ç¤ºä¾‹ï¼š{candidate.example}</em>
                    </span>
                  </label>
                ))
              ) : (
                <p className="cleanup-empty">æ‰«æåŽä¼šæŽ¨èDJAWA Photo Volç¼–å·ã€å¼€å¤´048è¿™ç±»ç–‘ä¼¼æ— ç”¨å†…å®¹ã€‚</p>
              )}
            </div>
            {renderCleanupPreview("noise")}
            {cleanupButton("noise")}
          </article>
        </div>
      </section>

      <footer className="command-bar">
        <button onClick={() => applyOperations(folderOps, "é‡å‘½åæ–‡ä»¶å¤¹ / Rename folders")} disabled={busy || !folderOps.length}>
          <CheckCircle2 size={16} />
          é‡å‘½åæ–‡ä»¶å¤¹ / Rename folders
        </button>
        <button onClick={() => applyOperations(fileOps, "é‡å‘½åæ–‡ä»¶ / Rename files")} disabled={busy || !fileOps.length}>
          <Play size={16} />
          é‡å‘½åæ–‡ä»¶ / Rename files
        </button>
        <button onClick={undo} disabled={busy || !lastLog}>
          <RotateCcw size={16} />
          æ’¤é”€ä¸Šæ¬¡ / Undo last
        </button>
        <button onClick={exportLog} disabled={busy || !scan}>
          <Download size={16} />
          å¯¼å‡ºæ—¥å¿— / Export log
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

