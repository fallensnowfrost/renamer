import { describe, expect, it } from "vitest";
import {
  buildCleanupOperations,
  defaultCleanupOptions,
  findNoiseCandidates,
  getCleanupError,
  transformFolderName,
  type CleanupOptions,
} from "./cleanup";
import type { ScanGroup } from "./types";

function options(overrides: Partial<CleanupOptions>): CleanupOptions {
  return { ...defaultCleanupOptions, ...overrides };
}

function group(originalName: string): ScanGroup {
  return {
    id: originalName,
    path: `E:\\Root\\${originalName}`,
    parentPath: "E:\\Root",
    originalName,
    targetFolderName: originalName,
    targetFolderPath: `E:\\Root\\${originalName}`,
    theme: originalName,
    confidence: "high",
    themeWarnings: [],
    folderStats: { imageCount: 0, videoCount: 0, totalBytes: 0, suffix: "" },
    files: [],
    depth: 1,
    status: "ready",
    warnings: [],
  };
}

describe("folder cleanup", () => {
  it("removes Photo Vol noise with a smart rule", () => {
    const name = "[Son Ye-Eun 손예은] - DJAWA Photo Vol 0216 - Staycation #5 [149P 2.99GB]";
    expect(transformFolderName(name, options({ smartRule: "photo-vol" }), "smart-rule")).toBe(
      "[Son Ye-Eun 손예은] - Staycation #5 [149P 2.99GB]",
    );
  });

  it("removes leading standalone numbers without removing ARTGRAVIA_VOL identifiers", () => {
    const name = "[Son Ye-Eun 손예은] - 048 ARTGRAVIA_VOL252 #1 [23P 33MB]";
    expect(transformFolderName(name, options({ smartRule: "leading-number" }), "smart-rule")).toBe(
      "[Son Ye-Eun 손예은] - ARTGRAVIA_VOL252 #1 [23P 33MB]",
    );
  });

  it("reports invalid regex and skips regex operations", () => {
    const cleanup = options({ regexRemovePattern: "[" });
    expect(getCleanupError(cleanup, "regex-remove")).toBeTruthy();
    expect(buildCleanupOperations([group("DJAWA Photo Vol 0216 Staycation")], cleanup, "regex-remove")).toEqual([]);
  });

  it("suggests noise but keeps ARTGRAVIA_VOL252 out of suggestions", () => {
    const candidates = findNoiseCandidates([
      group("[Son Ye-Eun 손예은] - DJAWA Photo Vol 0216 - Staycation #5 [149P 2.99GB]"),
      group("[Son Ye-Eun 손예은] - 048 ARTGRAVIA_VOL252 #1 [23P 33MB]"),
    ]);
    expect(candidates.some((candidate) => candidate.text === "DJAWA Photo Vol 0216")).toBe(true);
    expect(candidates.some((candidate) => candidate.text === "048")).toBe(true);
    expect(candidates.some((candidate) => candidate.text === "ARTGRAVIA_VOL252")).toBe(false);
  });
});
