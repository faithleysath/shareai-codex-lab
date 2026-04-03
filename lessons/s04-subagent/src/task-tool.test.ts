import { describe, expect, test } from "bun:test";

import { createTaskTool } from "./task-tool";

describe("createTaskTool", () => {
  test("delegates the prompt and wraps the child summary", async () => {
    const tool = createTaskTool(async (prompt) => ({
      subagent_label: "child-1",
      rounds: 3,
      tool_calls: 4,
      final_report: `child handled: ${prompt}`,
    }));

    const result = await tool.execute(JSON.stringify({ prompt: "inspect the project" }));

    expect(result.delegated_prompt).toBe("inspect the project");
    expect(result.subagent_label).toBe("child-1");
    expect(result.final_report).toContain("inspect the project");
  });

  test("rejects an empty prompt", async () => {
    const tool = createTaskTool(async () => ({
      subagent_label: "child-1",
      rounds: 1,
      tool_calls: 0,
      final_report: "noop",
    }));

    await expect(tool.execute(JSON.stringify({ prompt: "   " }))).rejects.toThrow(
      "`prompt` must be a non-empty string.",
    );
  });
});
