import type { RenameOperation, ScanGroup } from "./types";

export interface CleanupOptions {
  removePrefix: string;
  removeSuffix: string;
  removeContains: string;
  addText: string;
  addPosition: "prefix" | "suffix";
  replaceFrom: string;
  replaceTo: string;
  replaceCaseSensitive: boolean;
  trimOuterSpaces: boolean;
  selectedCommonText: string;
}

export const defaultCleanupOptions: CleanupOptions = {
  removePrefix: "",
  removeSuffix: "",
  removeContains: "",
  addText: "",
  addPosition: "suffix",
  replaceFrom: "",
  replaceTo: "",
  replaceCaseSensitive: false,
  trimOuterSpaces: false,
  selectedCommonText: "",
};

export function buildCleanupOperations(groups: ScanGroup[], options: CleanupOptions): RenameOperation[] {
  return groups
    .map<RenameOperation | null>((group) => {
      const nextName = transformFolderName(group.originalName, options);
      if (nextName === group.originalName || !nextName.trim()) return null;
      return {
        kind: "text-cleanup",
        from: group.path,
        to: joinPath(group.parentPath, nextName),
        label: `${group.originalName} -> ${nextName}`,
      };
    })
    .filter((operation): operation is RenameOperation => operation !== null);
}

export function transformFolderName(name: string, options: CleanupOptions) {
  let next = name;
  if (options.trimOuterSpaces) next = next.trim();
  if (options.removePrefix && next.startsWith(options.removePrefix)) {
    next = next.slice(options.removePrefix.length);
  }
  if (options.removeSuffix && next.endsWith(options.removeSuffix)) {
    next = next.slice(0, -options.removeSuffix.length);
  }
  if (options.removeContains) {
    next = removeAll(next, options.removeContains, false);
  }
  if (options.selectedCommonText) {
    next = removeAll(next, options.selectedCommonText, false);
  }
  if (options.replaceFrom) {
    const flags = options.replaceCaseSensitive ? "g" : "gi";
    next = next.replace(new RegExp(escapeRegExp(options.replaceFrom), flags), options.replaceTo);
  }
  if (options.addText) {
    next = options.addPosition === "prefix" ? `${options.addText}${next}` : `${next}${options.addText}`;
  }
  return next;
}

export function findCommonTextCandidates(names: string[]) {
  if (names.length < 2) return [];
  const shortest = [...names].sort((a, b) => a.length - b.length)[0] || "";
  const candidates = new Set<string>();
  for (let start = 0; start < shortest.length; start += 1) {
    for (let end = start + 2; end <= shortest.length; end += 1) {
      const candidate = shortest.slice(start, end).trim();
      if (candidate.length < 2) continue;
      if (names.every((name) => name.includes(candidate))) {
        candidates.add(candidate);
      }
    }
  }
  return [...candidates]
    .sort((a, b) => b.length - a.length || a.localeCompare(b, "zh-Hans-CN"))
    .slice(0, 12);
}

function removeAll(value: string, target: string, caseSensitive: boolean) {
  if (!target) return value;
  const flags = caseSensitive ? "g" : "gi";
  return value.replace(new RegExp(escapeRegExp(target), flags), "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function joinPath(parent: string, name: string) {
  const separator = parent.includes("/") && !parent.includes("\\") ? "/" : "\\";
  return `${parent.replace(/[\\/]+$/, "")}${separator}${name}`;
}
