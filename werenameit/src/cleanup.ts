import type { RenameOperation, ScanGroup } from "./types";

export type CleanupAction = "text-remove" | "smart-rule" | "regex-remove" | "replace" | "add" | "trim" | "noise";
export type SmartRule = "leading-number" | "photo-vol" | "vol-number" | "middle-number" | "brand-word";

export interface CleanupOptions {
  removeText: string;
  smartRule: SmartRule;
  smartBrandText: string;
  regexRemovePattern: string;
  regexCaseSensitive: boolean;
  addText: string;
  addPosition: "prefix" | "suffix";
  replaceFrom: string;
  replaceTo: string;
  replaceCaseSensitive: boolean;
  trimOuterSpaces: boolean;
  selectedNoiseTexts: string[];
}

export const defaultCleanupOptions: CleanupOptions = {
  removeText: "",
  smartRule: "leading-number",
  smartBrandText: "",
  regexRemovePattern: "",
  regexCaseSensitive: false,
  addText: "",
  addPosition: "suffix",
  replaceFrom: "",
  replaceTo: "",
  replaceCaseSensitive: false,
  trimOuterSpaces: false,
  selectedNoiseTexts: [],
};

export interface NoiseCandidate {
  id: string;
  text: string;
  count: number;
  example: string;
  reason: string;
}

export function buildCleanupOperations(groups: ScanGroup[], options: CleanupOptions, action: CleanupAction): RenameOperation[] {
  if (getCleanupError(options, action)) return [];
  return groups
    .map<RenameOperation | null>((group) => {
      const nextName = transformFolderName(group.originalName, options, action);
      if (!nextName || nextName === group.originalName || !nextName.trim() || isUnsafeThemeResult(nextName)) return null;
      return {
        kind: "text-cleanup",
        from: group.path,
        to: joinPath(group.parentPath, nextName),
        label: `${group.originalName} -> ${nextName}`,
      };
    })
    .filter((operation): operation is RenameOperation => operation !== null);
}

export function transformFolderName(name: string, options: CleanupOptions, action: CleanupAction) {
  let next = name;
  if (action === "text-remove" && options.removeText) {
    next = removeAll(next, options.removeText, false);
  }
  if (action === "smart-rule") {
    next = applySmartRule(next, options);
  }
  if (action === "regex-remove" && options.regexRemovePattern && !getCleanupError(options, action)) {
    const flags = options.regexCaseSensitive ? "g" : "gi";
    next = next.replace(new RegExp(options.regexRemovePattern, flags), "");
  }
  if (action === "replace" && options.replaceFrom) {
    const flags = options.replaceCaseSensitive ? "g" : "gi";
    next = next.replace(new RegExp(escapeRegExp(options.replaceFrom), flags), options.replaceTo);
  }
  if (action === "add" && options.addText) {
    next = options.addPosition === "prefix" ? `${options.addText}${next}` : `${next}${options.addText}`;
  }
  if (action === "trim" && options.trimOuterSpaces) {
    next = next.trim();
  }
  if (action === "noise" && options.selectedNoiseTexts.length) {
    for (const text of options.selectedNoiseTexts) {
      next = removeAll(next, text, false);
    }
  }
  return normalizeFolderName(next);
}

export function getCleanupError(options: CleanupOptions, action: CleanupAction) {
  if (action !== "regex-remove" || !options.regexRemovePattern) return "";
  try {
    new RegExp(options.regexRemovePattern);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

export function findNoiseCandidates(groups: ScanGroup[]): NoiseCandidate[] {
  const byText = new Map<string, NoiseCandidate>();
  const rules: Array<{ reason: string; regex: RegExp; pick?: (match: RegExpExecArray) => string }> = [
    { reason: "Photo Vol编号 / Photo Vol code", regex: /\b(?:[A-Z][A-Z0-9_-]*\s+)?Photo\s+Vol\s*0*\d+\b/gi },
    { reason: "开头编号 / Leading number", regex: /(?:^|\]\s*-\s*)(\d{2,4})(?=\s+[A-Za-z])/g, pick: (match) => match[1] },
    { reason: "中间孤立编号 / Middle standalone number", regex: /\s-\s(\d{2,4})(?=\s+[A-Za-z])/g, pick: (match) => match[1] },
  ];
  for (const group of groups) {
    for (const rule of rules) {
      rule.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.regex.exec(group.originalName))) {
        const text = (rule.pick ? rule.pick(match) : match[0]).trim();
        if (!text || isProtectedNoiseText(text)) continue;
        const existing = byText.get(text);
        if (existing) {
          existing.count += 1;
        } else {
          byText.set(text, {
            id: text,
            text,
            count: 1,
            example: group.originalName,
            reason: rule.reason,
          });
        }
      }
    }
  }
  return [...byText.values()].sort((a, b) => b.count - a.count || b.text.length - a.text.length || a.text.localeCompare(b.text, "zh-Hans-CN")).slice(0, 20);
}

function applySmartRule(value: string, options: CleanupOptions) {
  if (options.smartRule === "leading-number") {
    return value.replace(/(^|\]\s*-\s*)\d{2,4}\s+/g, "$1");
  }
  if (options.smartRule === "photo-vol") {
    return value.replace(/\b(?:[A-Z][A-Z0-9_-]*\s+)?Photo\s+Vol\s*0*\d+\b/gi, "");
  }
  if (options.smartRule === "vol-number") {
    return value.replace(/\bVol\s*0*\d+\b/gi, "");
  }
  if (options.smartRule === "middle-number") {
    return value.replace(/(\s-\s)\d{2,4}\s+/g, "$1");
  }
  if (options.smartRule === "brand-word" && options.smartBrandText) {
    return removeAll(value, options.smartBrandText, false);
  }
  return value;
}

function removeAll(value: string, target: string, caseSensitive: boolean) {
  if (!target) return value;
  const flags = caseSensitive ? "g" : "gi";
  return value.replace(new RegExp(escapeRegExp(target), flags), "");
}

function normalizeFolderName(value: string) {
  return value
    .replace(/[ \t]+/g, " ")
    .replace(/\s+-\s+-\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*-\s*/, "")
    .replace(/\s*-\s*$/, "")
    .replace(/\s+(\[[0-9]+P(?:\s+[0-9]+V)?\s+[0-9.]+(?:MB|GB)\])$/i, " $1")
    .trim();
}

function isProtectedNoiseText(text: string) {
  return /^ARTGRAVIA_VOL\d+$/i.test(text) || /^VOL\d+$/i.test(text);
}

function isUnsafeThemeResult(name: string) {
  const withoutStats = name.replace(/\[[0-9]+P(?:\s+[0-9]+V)?\s+[0-9.]+(?:MB|GB)\]$/i, "").trim();
  const afterPerson = withoutStats.replace(/^\[[^\]]+\]\s*-\s*/, "").trim();
  return afterPerson.length < 2 || /^\d+$/.test(afterPerson);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinPath(parent: string, name: string) {
  const separator = parent.includes("/") && !parent.includes("\\") ? "/" : "\\";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name}`;
}
