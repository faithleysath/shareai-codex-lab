import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions/completions";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadLessonEnv } from "./src/env";
import {
  formatAssistantContent,
  formatMessageRoleSummary,
  formatToolResultPreview,
  logAssistantMessage,
  logBanner,
  logDispatchLookup,
  logDispatchMap,
  logError,
  logFinalAnswer,
  logLoopPrimer,
  logNote,
  logResponseMeta,
  logRoundStart,
  logTodoReminderInjected,
  logToolCall,
  logToolResult,
  logTransition,
} from "./src/pretty";
import { createToolRegistry, TODO_WRITE_TOOL_NAME } from "./src/tool-registry";

const MAX_ROUNDS = 24;
const REQUEST_TIMEOUT_MS = 30_000;
const TODO_REMINDER_THRESHOLD = 3;

function buildSystemPrompt(rootPath: string): string {
  return [
    "You are a careful filesystem investigation agent working inside a fixed root directory.",
    `The fixed root directory is: ${rootPath}`,
    "You have three tools:",
    "1. todo_write: create or update a concise plan for a multi-step task. Use this before acting on a non-trivial task, and update it as progress changes.",
    "At most one todo item may be in_progress at a time.",
    "2. list_directory: list the immediate children of a directory inside the fixed root.",
    "3. read_file: read the full text content of one file inside the fixed root.",
    "The list_directory tool is not recursive. To discover a nested file, you must call it repeatedly on subdirectories.",
    "Only call read_file after you have discovered a concrete candidate path from directory listings.",
    "Because this task is multi-step, start by calling todo_write with a short plan before using the other tools.",
    "Never invent files, folders, or file contents.",
    "Never mention any path outside the fixed root directory.",
    "Treat symbolic links as leaf entries and do not recurse into them.",
    "When you are done, output:",
    "1. The discovered relative path to walk.ts.",
    "2. The password defined inside walk.ts.",
    "3. The exact full content of walk.ts in a fenced code block.",
    "4. The other file that consumes or exposes that password.",
    "5. A short explanation of how the todo list helped you stay organized.",
  ].join("\n");
}

function buildUserPrompt(rootPath: string): string {
  return [
    `Please inspect the fixed root directory ${rootPath}.`,
    "This is a multi-step investigation, so begin with todo_write before other tools.",
    "I need you to:",
    "1. Find a file named walk.ts somewhere under this root.",
    "2. Read that file and extract the password defined inside it.",
    "3. Trace which other file in the project consumes or exposes that password.",
    "4. Summarize the result clearly.",
    "I am intentionally not telling you the path.",
    "Use list_directory to discover the directory structure, then use read_file on the relevant files.",
    "Do not guess any file contents before reading them.",
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

function completionToAssistantMessage(
  message: OpenAI.Chat.Completions.ChatCompletionMessage,
): ChatCompletionAssistantMessageParam {
  return {
    role: "assistant",
    content: message.content ?? null,
    refusal: message.refusal ?? null,
    tool_calls: message.tool_calls,
  };
}

function buildToolMessage(toolCallId: string, content: string): ChatCompletionToolMessageParam {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    content,
  };
}

function safeJsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summarizeToolOutcome(resultText: string): string {
  try {
    const parsed = JSON.parse(resultText);
    return formatToolResultPreview(parsed);
  } catch {
    return resultText;
  }
}

function getFinalAnswer(message: OpenAI.Chat.Completions.ChatCompletionMessage): string {
  if (message.content && message.content.trim() !== "") {
    return message.content;
  }

  if (message.refusal && message.refusal.trim() !== "") {
    return message.refusal;
  }

  return "(The model ended without text content.)";
}

function buildTodoReminder(roundsSinceTodo: number): ChatCompletionMessageParam {
  return {
    role: "user",
    content: [
      `Reminder: you have gone ${roundsSinceTodo} rounds without updating todo_write.`,
      "This is a multi-step task. Refresh your todo list before continuing if the plan or progress has changed.",
    ].join("\n"),
  };
}

async function run(): Promise<void> {
  const env = loadLessonEnv();
  const rootPath = parseRootArgument();
  const toolRegistry = createToolRegistry(rootPath);

  const client = new OpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  logBanner({
    title: "S03 TodoWrite: Plan Before You Act",
    model: env.model,
    baseURL: env.baseURL,
    rootPath,
  });
  logLoopPrimer();
  logDispatchMap(toolRegistry.toolNames);
  logNote(
    "Compatibility note: this lesson still uses the same core loop. The new pieces are a stateful todo tool and a reminder when the plan has gone stale.",
  );

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemPrompt(rootPath),
    },
    {
      role: "user",
      content: buildUserPrompt(rootPath),
    },
  ];

  let totalToolCalls = 0;
  let roundsSinceTodo = 0;
  let reminderSentSinceLastTodo = false;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    if (roundsSinceTodo >= TODO_REMINDER_THRESHOLD && !reminderSentSinceLastTodo) {
      messages.push(buildTodoReminder(roundsSinceTodo));
      reminderSentSinceLastTodo = true;
      logTodoReminderInjected(roundsSinceTodo);
    }

    logRoundStart(round, formatMessageRoleSummary(messages));

    const completion = await client.chat.completions.create({
      model: env.model,
      temperature: 0,
      tool_choice: round === 1 ? "required" : "auto",
      parallel_tool_calls: false,
      messages,
      tools: toolRegistry.definitions,
    });

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error("The model returned no choices.");
    }

    const assistantMessage = choice.message;
    logResponseMeta({
      requestId: completion._request_id ?? null,
      finishReason: choice.finish_reason ?? null,
      usage: completion.usage ?? null,
      preview: formatAssistantContent(assistantMessage),
    });

    messages.push(completionToAssistantMessage(assistantMessage));

    if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      logAssistantMessage(
        "Assistant requested local tool execution, so we append the assistant tool_calls message and execute each tool call in-process.",
      );

      let usedTodoThisRound = false;

      for (const toolCall of assistantMessage.tool_calls) {
        totalToolCalls += 1;
        if (toolCall.type === "function" && toolCall.function.name === TODO_WRITE_TOOL_NAME) {
          usedTodoThisRound = true;
        }
        const toolResultText = await executeToolCall(toolRegistry, toolCall);
        const toolMessage = buildToolMessage(toolCall.id, toolResultText);

        messages.push(toolMessage);
        logTransition(
          "Tool result appended as a `tool` message. The next round will include both the assistant's tool request and our tool output.",
        );
      }

      if (usedTodoThisRound) {
        roundsSinceTodo = 0;
        reminderSentSinceLastTodo = false;
      } else {
        roundsSinceTodo += 1;
      }

      continue;
    }

    const finalAnswer = getFinalAnswer(assistantMessage);
    logFinalAnswer(finalAnswer, totalToolCalls);
    return;
  }

  throw new Error(`Reached the round limit (${MAX_ROUNDS}) before the model finished.`);
}

async function executeToolCall(
  toolRegistry: ReturnType<typeof createToolRegistry>,
  toolCall: ChatCompletionMessageToolCall,
): Promise<string> {
  if (toolCall.type !== "function") {
    const unsupported = safeJsonStringify({
      error: `Unsupported tool type: ${toolCall.type}`,
    });
    logToolCall(toolCall.type, "(custom tool arguments are not handled in this lesson)", unsupported);
    return unsupported;
  }

  logToolCall(toolCall.function.name, toolCall.function.arguments);
  logDispatchLookup(toolCall.function.name, toolRegistry.toolNames.includes(toolCall.function.name));

  const handler = toolRegistry.handlers[toolCall.function.name];
  if (!handler) {
    const unknownTool = safeJsonStringify({
      error: `Unknown tool: ${toolCall.function.name}`,
    });
    logToolResult(summarizeToolOutcome(unknownTool));
    return unknownTool;
  }

  try {
    const result = await handler(toolCall.function.arguments);
    const resultText = safeJsonStringify(result);
    logToolResult(formatToolResultPreview(result));
    return resultText;
  } catch (error) {
    const failure = safeJsonStringify({
      error: error instanceof Error ? error.message : String(error),
    });
    logToolResult(summarizeToolOutcome(failure));
    return failure;
  }
}

await run().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
