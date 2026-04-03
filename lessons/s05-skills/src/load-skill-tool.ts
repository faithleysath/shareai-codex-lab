import type { ChatCompletionTool } from "openai/resources/chat/completions/completions";

import { getSkillByName, getSkillNames, type SkillName } from "./skills";

export const LOAD_SKILL_TOOL_NAME = "load_skill";

export interface LoadSkillResult {
  skill_name: SkillName;
  title: string;
  summary: string;
  trigger_hints: string[];
  skill_content: string;
  note: string;
}

interface LoadSkillArgs {
  skill_name: string;
}

function ensurePlainObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

function parseToolArguments(rawArgs: string): LoadSkillArgs {
  const parsed = JSON.parse(rawArgs) as unknown;
  const value = ensurePlainObject(parsed);

  if (typeof value.skill_name !== "string" || value.skill_name.trim() === "") {
    throw new Error("`skill_name` must be a non-empty string.");
  }

  return {
    skill_name: value.skill_name.trim(),
  };
}

export function createLoadSkillTool(): {
  definition: ChatCompletionTool;
  execute: (rawArgs: string) => Promise<LoadSkillResult>;
} {
  const skillNames = getSkillNames();

  return {
    definition: {
      type: "function",
      function: {
        name: LOAD_SKILL_TOOL_NAME,
        description:
          "Load the full content of a named skill when the user's request clearly matches one of the advertised skill summaries.",
        strict: true,
        parameters: {
          type: "object",
          properties: {
            skill_name: {
              type: "string",
              enum: skillNames,
              description:
                "The exact skill name to load. Use this only after deciding that the current user request matches that skill.",
            },
          },
          required: ["skill_name"],
          additionalProperties: false,
        },
      },
    },
    async execute(rawArgs: string): Promise<LoadSkillResult> {
      const args = parseToolArguments(rawArgs);
      const skill = getSkillByName(args.skill_name);

      if (!skill) {
        throw new Error(`Unknown skill: ${args.skill_name}`);
      }

      return {
        skill_name: skill.name,
        title: skill.title,
        summary: skill.summary,
        trigger_hints: skill.triggerHints,
        skill_content: skill.content,
        note:
          "This full skill was loaded dynamically. Follow it for the current user request, and do not pretend it was already present in the original system prompt.",
      };
    },
  };
}
