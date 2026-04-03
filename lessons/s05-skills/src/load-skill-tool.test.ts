import { describe, expect, test } from "bun:test";

import { createLoadSkillTool, LOAD_SKILL_TOOL_NAME } from "./load-skill-tool";

describe("createLoadSkillTool", () => {
  test("exposes the load_skill schema", () => {
    const tool = createLoadSkillTool();

    expect(tool.definition.type).toBe("function");
    if (tool.definition.type !== "function") {
      throw new Error("Expected a function tool definition.");
    }

    expect(tool.definition.function.name).toBe(LOAD_SKILL_TOOL_NAME);
  });

  test("loads the full fortune skill", async () => {
    const tool = createLoadSkillTool();
    const result = await tool.execute(JSON.stringify({ skill_name: "fortune_teller" }));

    expect(result.skill_name).toBe("fortune_teller");
    expect(result.skill_content).toContain("Skill: 算命陪聊");
    expect(result.trigger_hints).toContain("算命");
  });

  test("rejects an unknown skill", async () => {
    const tool = createLoadSkillTool();

    await expect(
      tool.execute(JSON.stringify({ skill_name: "unknown_skill" })),
    ).rejects.toThrow("Unknown skill: unknown_skill");
  });
});
