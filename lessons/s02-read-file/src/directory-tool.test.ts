import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createDirectoryTool } from "./directory-tool";

describe("createDirectoryTool", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "s02-read-file-"));
    await mkdir(join(rootDir, "src"));
    await writeFile(join(rootDir, "src", "nested.ts"), "export const nested = true;\n");
    await writeFile(join(rootDir, "index.ts"), 'console.log("hello");\n');
    await writeFile(join(rootDir, ".env"), "OPENAI_API_KEY=test\n");
  });

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("lists only the immediate children of the requested directory", async () => {
    const tool = createDirectoryTool(rootDir);
    const result = await tool.execute(JSON.stringify({ relative_path: "." }));

    expect(result.requested_relative_path).toBe(".");
    expect(result.entries.map((entry) => entry.relative_path)).toEqual([
      "src",
      ".env",
      "index.ts",
    ]);
    expect(result.immediate_tree).toContain("src/");
    expect(result.immediate_tree).not.toContain("nested.ts");
  });

  test("can inspect a nested directory on a later tool call", async () => {
    const tool = createDirectoryTool(rootDir);
    const result = await tool.execute(JSON.stringify({ relative_path: "src" }));

    expect(result.requested_relative_path).toBe("src");
    expect(result.entries.map((entry) => entry.relative_path)).toEqual(["src/nested.ts"]);
  });

  test("blocks path traversal outside the fixed root", async () => {
    const tool = createDirectoryTool(rootDir);

    await expect(tool.execute(JSON.stringify({ relative_path: "../.." }))).rejects.toThrow(
      "Path escape blocked",
    );
  });
});
