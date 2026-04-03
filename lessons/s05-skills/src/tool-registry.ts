import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import { createLoadSkillTool, LOAD_SKILL_TOOL_NAME } from "./load-skill-tool";

export type ToolHandler = (rawArgs: string) => Promise<unknown>;

export interface ToolRegistry {
  definitions: ChatCompletionTool[];
  handlers: Record<string, ToolHandler>;
  toolNames: string[];
}

export function createToolRegistry(): ToolRegistry {
  const loadSkillTool = createLoadSkillTool();

  return {
    definitions: [loadSkillTool.definition],
    handlers: {
      [LOAD_SKILL_TOOL_NAME]: loadSkillTool.execute,
    },
    toolNames: [LOAD_SKILL_TOOL_NAME],
  };
}
