import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eraser,
  FolderOpen,
  ListChecks,
  Play,
  Plus,
  Replace,
  RotateCcw,
  ScanLine,
  Scissors,
  Sparkles,
  Wand2,
} from "lucide-react";
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

const idleProgress: ProgressState = {
  phase: "idle",
  current: 0,
  total: 0,
  label: "",
};

const cleanupActions: CleanupAction[] = ["text-remove", "smart-rule", "regex-remove", "replace", "add", "trim", "noise"];

const cleanupLabels: Record<CleanupAction, string> = {
  "text-remove": "普通文本删除",
  "smart-rule": "智能规则删除",
  "regex-remove": "高级正则删除",
  replace: "替换内容",
  add: "添加前缀后缀",
  trim: "删除首尾空格",
  noise: "无用内容推荐",
};

const smartRuleLabels: Record<CleanupOptions["smartRule"], string> = {
  "leading-number": "删除开头编号，如048 ARTGRAVIA...",
  "photo-vol": "删除Photo Vol编号，如DJAWA Photo Vol 0216",
  "vol-number": "删除Vol编号，如Vol 0216",
  "middle-number": "删除中间孤立编号，如- 048 ARTGRAVIA",
  "brand-word": "删除指定品牌词，如DJAWA、BLUECAKE",
};

function App() {
  const [rootPath, setRootPath] = useState("");
  const [personName, setPersonName] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("natural");
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [cleanup, setCleanup] = useState<CleanupOptions>(defaultCleanupOptions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("选择根文件夹后即可扫描。人物名称只用于文件夹前缀和主题清理，重命名文件不需要填写人物名称。");
  const [lastLog, setLastLog] = useState<RenameLog | null>(null);
  const [progress, setProgress] = useState<ProgressState>(idleProgress);
  const [sideTab, setSideTab] = useState<"inspector" | "cleanup">("inspector");
  const api = useMemo(() => getRenamerApi(), []);

  const groups = scan?.groups || [];
  const selectedGroup = groups.find((group) => group.id === selectedId) || groups[0] || null;
  const folderOps = useMemo(() => buildFolderOperations(groups), [groups]);
  const fileOps = useMemo(() => buildFileOperations(groups), [groups]);
  const cleanupActionOps = useMemo(
    () => Object.fromEntries(cleanupActions.map((action) => [action, buildCleanupOperations(groups, cleanup, action)])) as Record<CleanupAction, RenameOperation[]>,
    [groups, cleanup],
  );
  const noiseCandidates = useMemo(() => findNoiseCandidates(groups), [groups]);
  const regexError = useMemo(() => getCleanupError(cleanup, "regex-remove"), [cleanup]);
  const warningCount = useMemo(() => countWarnings(groups), [groups]);
  const mediaCount = useMemo(() => groups.reduce((sum, group) => sum + group.files.length, 0), [groups]);
  const progressPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const progressVisible = busy || progress.phase !== "idle";

  useEffect(() => {
    if (!api.onProgress) return undefined;
    return api.onProgress((nextProgress) => setProgress(nextProgress));
  }, [api]);

  async function chooseFolder() {
    const folder = await api.selectFolder();
    if (folder) setRootPath(folder);
  }

  async function runScan() {
    if (!rootPath.trim()) {
      setMessage("请先选择或输入根文件夹路径。");
      return;
    }
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: 0, label: "正在扫描..." });
    try {
      const result = await api.scan({ rootPath, personName, sortMode });
      setScan(result);
      setSelectedId(result.groups[0]?.id || "");
      setMessage(`扫描完成：${result.groups.length}个子文件夹，${result.groups.reduce((sum, group) => sum + group.files.length, 0)}个媒体文件。`);
      setProgress({ phase: "complete", current: result.groups.length, total: result.groups.length, label: "扫描完成" });
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function applyOperations(operations: RenameOperation[], label: string) {
    if (!operations.length) {
      setMessage("没有需要执行的项目。");
      return;
    }
    const runnableOperations = operations.filter((operation) => operation.from !== operation.to);
    if (!runnableOperations.length) {
      setMessage("没有需要执行的有效项目。");
      return;
    }
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: runnableOperations.length, label: `${label}...` });
    try {
      const log = await api.apply({ operations: runnableOperations });
      setLastLog(log);
      const skipped = log.skipped?.length || 0;
      setMessage(`${label}完成：成功${log.operations.length}项，跳过${skipped}项。`);
      setProgress({ phase: "complete", current: log.operations.length, total: runnableOperations.length, label: `${label}完成` });
      await runScan();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function undo() {
    setBusy(true);
    setProgress({ phase: "indeterminate", current: 0, total: 0, label: "正在撤销..." });
    try {
      const log = await api.undo();
      setLastLog(null);
      setMessage(`已撤销：${log.operations.length}项。`);
      setProgress({ phase: "complete", current: log.operations.length, total: log.operations.length, label: "撤销完成" });
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
    if (filePath) setMessage(`日志已导出：${filePath}`);
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
      return <p className="cleanup-error">正则表达式错误：{regexError}</p>;
    }
    if (!operations.length) {
      return <p className="cleanup-empty">暂无可预览的变化。</p>;
    }
    return (
      <div className="preview-stack">
        {operations.slice(0, 5).map((operation) => (
          <span key={`${action}-${operation.from}`}>{operation.label}</span>
        ))}
        {operations.length > 5 ? <em>还有{operations.length - 5}项</em> : null}
      </div>
    );
  }

  function cleanupButton(action: CleanupAction) {
    const operations = cleanupActionOps[action];
    const disabled = busy || !operations.length || (action === "regex-remove" && Boolean(regexError));
    return (
      <button className="compact-action" onClick={() => applyOperations(operations, cleanupLabels[action])} disabled={disabled}>
        <Wand2 size={15} />
        预览无误，执行
      </button>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-block">
          <span className="brand-mark">we</span>
          <div>
            <h1>werenameit</h1>
            <p>0.2.0-alpha.1未发布版本 · 离线媒体批量重命名工具</p>
          </div>
        </div>
        <div className="header-actions">
          <button className="ghost-button" onClick={chooseFolder} title="选择文件夹">
            <FolderOpen size={18} />
          </button>
          <button className="primary-button" onClick={runScan} disabled={busy || !rootPath.trim()}>
            <ScanLine size={16} />
            扫描
          </button>
        </div>
      </header>

      <section className="control-deck">
        <div className="field root-field">
          <label>根文件夹</label>
          <input value={rootPath} onChange={(event) => setRootPath(event.target.value)} placeholder="E:\Media\Person" />
        </div>
        <div className="field">
          <label>人物名称</label>
          <input value={personName} onChange={(event) => setPersonName(event.target.value)} placeholder="可选，仅文件夹用" />
        </div>
        <div className="field">
          <label>文件排序</label>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
            <option value="natural">文件名自然排序</option>
            <option value="modified">修改时间排序</option>
            <option value="created">创建时间排序</option>
          </select>
        </div>
      </section>

      <section className="command-deck">
        <div className="message-line">
          <strong>{message}</strong>
          <span>{groups.length ? `${groups.length}个文件夹 · ${mediaCount}个媒体文件 · ${warningCount}个警告` : "等待扫描"}</span>
        </div>
        <div className="progress-box">
          <div className="progress-copy">
            <span>{progressVisible ? progress.label || "正在处理" : "空闲"}</span>
            <b>{progress.total > 0 ? `${progress.current}/${progress.total}(${progressPercent}%)` : busy ? "处理中" : "Ready"}</b>
          </div>
          <div className={`progress-track ${progress.total > 0 ? "" : "indeterminate"}`}>
            <div className="progress-fill" style={{ width: progress.total > 0 ? `${Math.min(progressPercent, 100)}%` : "36%" }} />
          </div>
        </div>
        <div className="operation-buttons">
          <button onClick={() => applyOperations(folderOps, "重命名文件夹")} disabled={busy || !folderOps.length}>
            <CheckCircle2 size={16} />
            重命名文件夹
            <b>{folderOps.length}</b>
          </button>
          <button onClick={() => applyOperations(fileOps, "重命名文件")} disabled={busy || !fileOps.length}>
            <Play size={16} />
            重命名文件
            <b>{fileOps.length}</b>
          </button>
          <button onClick={undo} disabled={busy || !lastLog}>
            <RotateCcw size={16} />
            撤销上次
          </button>
          <button onClick={exportLog} disabled={busy || !scan}>
            <Download size={16} />
            导出日志
          </button>
        </div>
      </section>

      <section className="workbench">
        <section className="folder-panel">
          <div className="panel-title">
            <div>
              <h2>文件夹预览</h2>
              <p>只有此列表滚动，顶部操作和右侧工具保持可见。</p>
            </div>
            <div className="summary-pills">
              <span>{folderOps.length}个文件夹操作</span>
              <span>{fileOps.length}个文件操作</span>
              <span className={warningCount ? "warn-pill" : ""}>{warningCount}个警告</span>
            </div>
          </div>
          <div className="folder-table">
            <div className="folder-row table-head">
              <span>原名称</span>
              <span>主题</span>
              <span>统计</span>
              <span>目标名称</span>
            </div>
            <div className="folder-scroll">
              {groups.length ? (
                groups.map((group) => (
                  <button
                    key={group.id}
                    className={`folder-row row-button ${selectedGroup?.id === group.id ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedId(group.id);
                      setSideTab("inspector");
                    }}
                  >
                    <span className="folder-name" style={{ paddingLeft: `${Math.max(group.depth - 1, 0) * 14}px` }}>
                      {group.originalName}
                    </span>
                    <span>{group.theme || "需要修正"}</span>
                    <span>{group.folderStats.suffix || "无媒体"}</span>
                    <span>{group.targetFolderName}</span>
                  </button>
                ))
              ) : (
                <div className="empty-state">
                  <ListChecks size={32} />
                  <strong>还没有扫描结果</strong>
                  <span>选择根文件夹后点击扫描。</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="side-panel">
          <div className="side-tabs">
            <button className={sideTab === "inspector" ? "active" : ""} onClick={() => setSideTab("inspector")}>
              详情
            </button>
            <button className={sideTab === "cleanup" ? "active" : ""} onClick={() => setSideTab("cleanup")}>
              名称清理
            </button>
          </div>
          {sideTab === "inspector" ? renderInspector(selectedGroup) : renderCleanupTools()}
        </aside>
      </section>
    </main>
  );

  function renderInspector(group: ScanGroup | null) {
    if (!group) {
      return (
        <div className="side-body center-body">
          <AlertTriangle size={28} />
          <strong>暂无详情</strong>
          <span>扫描后选择一个文件夹查看。</span>
        </div>
      );
    }
    const imageFiles = group.files.filter((file) => file.kind === "image");
    const videoFiles = group.files.filter((file) => file.kind === "video");
    return (
      <div className="side-body">
        <div className="detail-card">
          <h3>当前文件夹</h3>
          <div className="info-grid">
            <span>路径</span>
            <b>{group.path}</b>
            <span>主题</span>
            <b>{group.theme || "需要修正"}</b>
            <span>图片</span>
            <b>{group.folderStats.imageCount}P</b>
            <span>视频</span>
            <b>{group.folderStats.videoCount}V</b>
            <span>文件</span>
            <b>{group.files.length}</b>
          </div>
        </div>

        <div className={`warning-box ${group.warnings.length ? "has-warning" : ""}`}>
          {group.warnings.length ? group.warnings.map((warning) => <p key={warning}>{warning}</p>) : <p>无警告</p>}
        </div>

        <div className="detail-card">
          <h3>当前层文件预览</h3>
          <PreviewList title="图片编号" files={imageFiles} />
          <PreviewList title="视频编号" files={videoFiles} />
        </div>
      </div>
    );
  }

  function renderCleanupTools() {
    return (
      <div className="side-body cleanup-body">
        <CleanupCard title="普通文本删除" icon={<Eraser size={16} />} count={cleanupActionOps["text-remove"].length} action="text-remove">
          <label className="field">
            <span>要删除的固定文本</span>
            <input value={cleanup.removeText} onChange={(event) => setCleanup({ ...cleanup, removeText: event.target.value })} placeholder="DJAWA" />
          </label>
        </CleanupCard>

        <CleanupCard title="智能规则删除" icon={<Sparkles size={16} />} count={cleanupActionOps["smart-rule"].length} action="smart-rule">
          <label className="field">
            <span>选择规则</span>
            <select value={cleanup.smartRule} onChange={(event) => setCleanup({ ...cleanup, smartRule: event.target.value as CleanupOptions["smartRule"] })}>
              {Object.entries(smartRuleLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {cleanup.smartRule === "brand-word" ? (
            <label className="field">
              <span>品牌词</span>
              <input value={cleanup.smartBrandText} onChange={(event) => setCleanup({ ...cleanup, smartBrandText: event.target.value })} placeholder="DJAWA" />
            </label>
          ) : null}
        </CleanupCard>

        <CleanupCard title="高级正则删除" icon={<Scissors size={16} />} count={cleanupActionOps["regex-remove"].length} action="regex-remove">
          <label className="field">
            <span>表达式</span>
            <input value={cleanup.regexRemovePattern} onChange={(event) => setCleanup({ ...cleanup, regexRemovePattern: event.target.value })} placeholder="DJAWA Photo Vol \\d+" />
          </label>
          <div className="regex-examples">
            {["DJAWA Photo Vol \\d+", "^\\d{2,4}\\s+", "\\s+-\\s+\\d{2,4}\\s+"].map((pattern) => (
              <button key={pattern} type="button" onClick={() => setCleanup({ ...cleanup, regexRemovePattern: pattern })}>
                {pattern}
              </button>
            ))}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={cleanup.regexCaseSensitive} onChange={(event) => setCleanup({ ...cleanup, regexCaseSensitive: event.target.checked })} />
            区分大小写
          </label>
          <p className="hint">\\d+表示数字，^表示开头，\\s+表示空格。不会写正则时优先用智能规则。</p>
        </CleanupCard>

        <CleanupCard title="替换内容" icon={<Replace size={16} />} count={cleanupActionOps.replace.length} action="replace">
          <label className="field">
            <span>查找</span>
            <input value={cleanup.replaceFrom} onChange={(event) => setCleanup({ ...cleanup, replaceFrom: event.target.value })} />
          </label>
          <label className="field">
            <span>替换为</span>
            <input value={cleanup.replaceTo} onChange={(event) => setCleanup({ ...cleanup, replaceTo: event.target.value })} />
          </label>
          <label className="check-row">
            <input type="checkbox" checked={cleanup.replaceCaseSensitive} onChange={(event) => setCleanup({ ...cleanup, replaceCaseSensitive: event.target.checked })} />
            区分大小写
          </label>
        </CleanupCard>

        <CleanupCard title="添加前缀后缀" icon={<Plus size={16} />} count={cleanupActionOps.add.length} action="add">
          <label className="field">
            <span>添加内容</span>
            <input value={cleanup.addText} onChange={(event) => setCleanup({ ...cleanup, addText: event.target.value })} />
          </label>
          <label className="field">
            <span>位置</span>
            <select value={cleanup.addPosition} onChange={(event) => setCleanup({ ...cleanup, addPosition: event.target.value as "prefix" | "suffix" })}>
              <option value="prefix">前缀</option>
              <option value="suffix">后缀</option>
            </select>
          </label>
        </CleanupCard>

        <CleanupCard title="删除首尾空格" icon={<Scissors size={16} />} count={cleanupActionOps.trim.length} action="trim">
          <label className="check-row">
            <input type="checkbox" checked={cleanup.trimOuterSpaces} onChange={(event) => setCleanup({ ...cleanup, trimOuterSpaces: event.target.checked })} />
            只删除文件夹名称开头和结尾的空白
          </label>
        </CleanupCard>

        <CleanupCard title="无用内容推荐" icon={<Sparkles size={16} />} count={cleanupActionOps.noise.length} action="noise">
          <div className="noise-list">
            {noiseCandidates.length ? (
              noiseCandidates.map((candidate) => (
                <label key={candidate.id} className="noise-option">
                  <input type="checkbox" checked={cleanup.selectedNoiseTexts.includes(candidate.text)} onChange={() => toggleNoiseText(candidate.text)} />
                  <span>
                    <b>{candidate.text}</b>
                    <em>
                      {candidate.reason} · {candidate.count}项 · 示例：{candidate.example}
                    </em>
                  </span>
                </label>
              ))
            ) : (
              <p className="cleanup-empty">扫描后会推荐DJAWA Photo Vol编号、开头048这类疑似无用内容。程序只推荐，必须勾选后才执行。</p>
            )}
          </div>
        </CleanupCard>
      </div>
    );
  }

  function CleanupCard(props: { title: string; icon: React.ReactNode; count: number; action: CleanupAction; children: React.ReactNode }) {
    return (
      <article className="cleanup-card">
        <div className="cleanup-title">
          <span>
            {props.icon}
            {props.title}
          </span>
          <b>{props.count}项</b>
        </div>
        {props.children}
        {renderCleanupPreview(props.action)}
        {cleanupButton(props.action)}
      </article>
    );
  }
}

function PreviewList(props: { title: string; files: ScanGroup["files"] }) {
  return (
    <div className="file-preview-group">
      <div className="file-preview-title">
        <span>{props.title}</span>
        <b>{props.files.length}个</b>
      </div>
      <div className="mini-list">
        {props.files.slice(0, 8).map((file) => (
          <div key={file.path}>
            <span>{file.name}</span>
            <strong>{file.targetName}</strong>
          </div>
        ))}
        {!props.files.length ? <em>无文件</em> : null}
        {props.files.length > 8 ? <em>还有{props.files.length - 8}项</em> : null}
      </div>
    </div>
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
