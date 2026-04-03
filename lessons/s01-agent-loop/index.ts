import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions/completions";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createDirectoryTool, DIRECTORY_TOOL_NAME } from "./src/directory-tool";
import { loadLessonEnv } from "./src/env";
import {
  formatAssistantContent,
  formatMessageRoleSummary,
  formatToolResultPreview,
  logAssistantMessage,
  logBanner,
  logError,
  logFinalAnswer,
  logLoopPrimer,
  logNote,
  logResponseMeta,
  logRoundStart,
  logToolCall,
  logToolResult,
  logTransition,
} from "./src/pretty";

const MAX_ROUNDS = 24;
const REQUEST_TIMEOUT_MS = 30_000;

function buildSystemPrompt(rootPath: string): string {
  return [
    "You are a careful filesystem exploration agent.",
    `You may only inspect files and folders inside this fixed root directory: ${rootPath}`,
    "You have exactly one tool: list_directory.",
    "The tool only returns the immediate children of a directory and never returns recursive contents.",
    "To build a full tree, you must call the tool repeatedly on every directory you discover.",
    "Never invent files or folders.",
    "Never mention any path outside the fixed root directory.",
    "Treat symbolic links as leaf entries and do not recurse into them.",
    "When you are done, output:",
    "1. A complete tree for the fixed root directory.",
    "2. A short note explaining how many tool calls were needed and why the loop was necessary.",
  ].join("\n");
}

function buildUserPrompt(rootPath: string): string {
  return [
    `Please inspect the fixed root directory ${rootPath}.`,
    "Your goal is to output the full tree structure for that directory.",
    'Start by calling list_directory with {"relative_path":"."}.',
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

async function run(): Promise<void> {
  const env = loadLessonEnv();
  const rootPath = parseRootArgument();
  const directoryTool = createDirectoryTool(rootPath);

  const client = new OpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  logBanner({
    title: "S01 Agent Loop: Safe Directory Explorer",
    model: env.model,
    baseURL: env.baseURL,
    rootPath,
  });
  logLoopPrimer();
  logNote(
    "Compatibility note: this lesson uses the Chat Completions tool-calling loop because it is widely supported by OpenAI-compatible providers.",
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

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    logRoundStart(round, formatMessageRoleSummary(messages));

    const completion = await client.chat.completions.create({
      model: env.model,
      temperature: 0,
      tool_choice: round === 1 ? "required" : "auto",
      parallel_tool_calls: false,
      messages,
      tools: [directoryTool.definition],
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

      for (const toolCall of assistantMessage.tool_calls) {
        totalToolCalls += 1;
        const toolResultText = await executeToolCall(directoryTool, toolCall);
        const toolMessage = buildToolMessage(toolCall.id, toolResultText);

        messages.push(toolMessage);
        logTransition(
          "Tool result appended as a `tool` message. The next round will include both the assistant's tool request and our tool output.",
        );
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
  directoryTool: ReturnType<typeof createDirectoryTool>,
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

  if (toolCall.function.name !== DIRECTORY_TOOL_NAME) {
    const unknownTool = safeJsonStringify({
      error: `Unknown tool: ${toolCall.function.name}`,
    });
    logToolResult(summarizeToolOutcome(unknownTool));
    return unknownTool;
  }

  try {
    const result = await directoryTool.execute(toolCall.function.arguments);
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
