import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createReadFileTool } from "./read-file-tool";

describe("createReadFileTool", () => {
  let rootDir = "";

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "s02-read-file-"));
    await mkdir(join(rootDir, "src"));
    await writeFile(
      join(rootDir, "src", "walk.ts"),
      'export const PASSWORD = "lotus-door-731";\n',
    );
  });

  afterEach(async () => {
    if (rootDir) {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  test("reads the full contents of a file inside the fixed root", async () => {
    const tool = createReadFileTool(rootDir);
    const result = await tool.execute(JSON.stringify({ relative_path: "src/walk.ts" }));

    expect(result.requested_relative_path).toBe("src/walk.ts");
    expect(result.content).toContain('PASSWORD = "lotus-door-731"');
    expect(result.line_count).toBe(2);
  });

  test("rejects directories", async () => {
    const tool = createReadFileTool(rootDir);

    await expect(tool.execute(JSON.stringify({ relative_path: "src" }))).rejects.toThrow(
      "not a regular file",
    );
  });

  test("blocks path traversal outside the fixed root", async () => {
    const tool = createReadFileTool(rootDir);

    await expect(tool.execute(JSON.stringify({ relative_path: "../secret.txt" }))).rejects.toThrow(
      "Path escape blocked",
    );
  });
});
