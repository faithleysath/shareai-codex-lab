import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions/completions";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runAgentLoop } from "./src/agent-runner";
import { DIRECTORY_TOOL_NAME } from "./src/directory-tool";
import { loadLessonEnv } from "./src/env";
import {
  logBanner,
  logDispatchMap,
  logFinalAnswer,
  logLoopPrimer,
  logNote,
  logSubagentLaunch,
  logSubagentResult,
} from "./src/pretty";
import { createBaseToolRegistry, createParentToolRegistry, TASK_TOOL_NAME } from "./src/tool-registry";

const MAX_ROUNDS = 24;
const REQUEST_TIMEOUT_MS = 30_000;

function buildParentSystemPrompt(rootPath: string): string {
  return [
    "You are a parent agent coordinating a fixed-root filesystem investigation.",
    `The fixed root directory is: ${rootPath}`,
    "You have access to three tools:",
    "1. task: delegate an exploratory subtask to a fresh-context child agent.",
    "2. list_directory: list one directory level inside the fixed root.",
    "3. read_file: read one file inside the fixed root.",
    "For this lesson, prefer delegating broad multi-file exploration with task instead of doing all file reads yourself.",
    "The child agent does not have the task tool, so it cannot recursively spawn more subagents.",
    "The task tool returns only the child's final summary. The child's intermediate messages and tool results stay out of the parent message history.",
    "Never invent file contents or paths.",
    "Never mention any path outside the fixed root directory.",
    "When you are done, output:",
    "1. Which test framework this project uses.",
    "2. Where API_TOKEN is defined.",
    "3. Which file directly sends or exposes that token upstream.",
    "4. A short note on why delegating to a child agent kept the parent context cleaner.",
  ].join("\n");
}

function buildParentUserPrompt(rootPath: string): string {
  return [
    `Please inspect the fixed root directory ${rootPath}.`,
    "Use a subtask to investigate this project.",
    "I need the final answer to tell me:",
    "1. Which testing framework the project uses.",
    "2. Which file defines API_TOKEN.",
    "3. Which file directly sends or exposes that token to an upstream endpoint.",
    "4. The relevant relative file paths.",
    "Start by delegating this exploratory work with the task tool so the parent context stays clean.",
  ].join("\n");
}

function buildChildSystemPrompt(rootPath: string): string {
  return [
    "You are a child agent with fresh context.",
    `The fixed root directory is: ${rootPath}`,
    "You only have these tools:",
    "1. list_directory",
    "2. read_file",
    "You do not have the task tool, so you cannot spawn more subagents.",
    "Begin by exploring the root directory unless the delegated prompt already gives an exact file path.",
    "Investigate carefully and return a concise factual summary with cited relative file paths.",
    "Never invent file contents or paths.",
  ].join("\n");
}

function parseRootArgument(): string {
  const cliValue = Bun.argv[2];
  if (cliValue && cliValue.trim() !== "") {
    return resolve(cliValue);
  }

  const currentFile = fileURLToPath(import.meta.url);
  return resolve(dirname(currentFile), "demo-target");
}

async function run(): Promise<void> {
  const env = loadLessonEnv();
  const rootPath = parseRootArgument();
  const client = new OpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  let childCounter = 0;

  const delegateTask = async (prompt: string) => {
    childCounter += 1;
    const subagentLabel = `child-${childCounter}`;
    const childMessages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: buildChildSystemPrompt(rootPath),
      },
      {
        role: "user",
        content: prompt,
      },
    ];
    const childRegistry = createBaseToolRegistry(rootPath);

    logSubagentLaunch(subagentLabel, prompt);
    logDispatchMap(childRegistry.toolNames, subagentLabel);

    const result = await runAgentLoop({
      agentLabel: subagentLabel,
      client,
      model: env.model,
      messages: childMessages,
      toolRegistry: childRegistry,
      maxRounds: MAX_ROUNDS,
      firstRoundTools: childRegistry.definitions.filter(
        (tool) => tool.type === "function" && tool.function.name === DIRECTORY_TOOL_NAME,
      ),
    });

    logSubagentResult(subagentLabel, result.finalAnswer, result.totalToolCalls, result.rounds);

    return {
      subagent_label: subagentLabel,
      rounds: result.rounds,
      tool_calls: result.totalToolCalls,
      final_report: result.finalAnswer,
    };
  };

  const parentRegistry = createParentToolRegistry(rootPath, delegateTask);
  const parentMessages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildParentSystemPrompt(rootPath),
    },
    {
      role: "user",
      content: buildParentUserPrompt(rootPath),
    },
  ];

  logBanner({
    title: "S04 Subagent: Delegate Exploration",
    model: env.model,
    baseURL: env.baseURL,
    rootPath,
  });
  logLoopPrimer([
    "1. The parent agent receives the user task plus all parent-visible tools.",
    "2. On an exploratory task, the parent delegates with the task tool.",
    "3. The task tool launches a child agent with fresh context and only the base file tools.",
    "4. The child explores the codebase and returns a concise summary.",
    "5. The parent receives only that summary as tool output, not the child's raw transcript.",
    "6. The parent uses the summary to produce the final answer.",
  ]);
  logDispatchMap(parentRegistry.toolNames, "parent");
  logNote(
    "This lesson is about context isolation. The child can do the messy exploration; the parent only keeps the distilled result.",
  );

  const result = await runAgentLoop({
    agentLabel: "parent",
    client,
    model: env.model,
    messages: parentMessages,
    toolRegistry: parentRegistry,
    maxRounds: MAX_ROUNDS,
    firstRoundTools: parentRegistry.definitions.filter(
      (tool) => tool.type === "function" && tool.function.name === TASK_TOOL_NAME,
    ),
  });

  logFinalAnswer(result.finalAnswer, result.totalToolCalls);
}

await run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
