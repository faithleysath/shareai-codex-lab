import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
} from "openai/resources/chat/completions/completions";

import { BackgroundTaskManager } from "./src/background-manager";
import { loadLessonEnv } from "./src/env";
import { FIBONACCI_ASYNC_TOOL_NAME } from "./src/fibonacci-async-tool";
import { HANOI_ASYNC_TOOL_NAME } from "./src/hanoi-async-tool";
import {
  buildBackgroundResultsMessage,
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
  logNotificationInjection,
  logResponseMeta,
  logRoundStart,
  logToolCall,
  logToolResult,
  logTransition,
  logWaitingForBackground,
} from "./src/pretty";
import { createToolRegistry } from "./src/tool-registry";

const MAX_ROUNDS = 16;
const REQUEST_TIMEOUT_MS = 60_000;
const BACKGROUND_WAIT_TIMEOUT_MS = 25_000;
const ARTIFICIAL_DELAY_MS = 20_000;

function buildSystemPrompt(): string {
  return [
    "You are a careful assistant in a background-task lesson.",
    "You have two async tools:",
    `1. ${FIBONACCI_ASYNC_TOOL_NAME}`,
    `2. ${HANOI_ASYNC_TOOL_NAME}`,
    "Each async tool starts a background job and immediately returns a task receipt.",
    "The real result arrives later as a synthetic message wrapped in <background-results>...</background-results>.",
    "When the user needs both computations, start both async tools as early as possible, ideally in the same assistant turn.",
    "Do not give the final answer until the relevant background results have arrived.",
    "When you do answer, include:",
    "1. The Fibonacci result.",
    "2. The Hanoi minimal move count.",
    "3. A short explanation that the background notifications were injected into message history before your next turn.",
  ].join("\n");
}

function buildUserPrompt(): string {
  return [
    "Please calculate two things for me:",
    "1. Fibonacci(45)",
    "2. The minimum number of moves required for a 18-layer Tower of Hanoi",
    "Start both async tools first, then wait for the background results to come back.",
    "When both results have arrived, give me a concise final answer.",
  ].join("\n");
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

function appendBackgroundNotifications(
  messages: ChatCompletionMessageParam[],
  notificationsText: string,
): void {
  messages.push({
    role: "user",
    content: notificationsText,
  });
  messages.push({
    role: "assistant",
    content: "Noted background results.",
  });
}

async function flushBackgroundNotifications(
  manager: BackgroundTaskManager,
  messages: ChatCompletionMessageParam[],
): Promise<void> {
  let notifications = manager.drainNotifications();

  if (notifications.length === 0 && manager.hasPendingTasks()) {
    logWaitingForBackground(manager.getPendingTaskCount());
    notifications = await manager.waitForNotifications(BACKGROUND_WAIT_TIMEOUT_MS);
  }

  if (notifications.length === 0) {
    return;
  }

  logNotificationInjection(notifications);
  appendBackgroundNotifications(messages, buildBackgroundResultsMessage(notifications));
  logTransition(
    "Background notifications were appended as fresh messages at the end of history. We do not mutate older tool messages.",
  );
}

function flushReadyNotificationsImmediately(
  manager: BackgroundTaskManager,
  messages: ChatCompletionMessageParam[],
): boolean {
  const notifications = manager.drainNotifications();

  if (notifications.length === 0) {
    return false;
  }

  logNotificationInjection(notifications);
  appendBackgroundNotifications(messages, buildBackgroundResultsMessage(notifications));
  logTransition(
    "While the model was thinking, more background results arrived. We append them as new tail messages before allowing any final answer.",
  );
  return true;
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

async function run(): Promise<void> {
  const env = loadLessonEnv();
  const manager = new BackgroundTaskManager();
  const toolRegistry = createToolRegistry(manager);
  const userPrompt = buildUserPrompt();

  const client = new OpenAI({
    apiKey: env.apiKey,
    baseURL: env.baseURL,
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });

  logBanner({
    title: "S08 Background Tasks: Async Tools + Notification Queue",
    model: env.model,
    baseURL: env.baseURL,
    userPrompt,
    artificialDelayMs: ARTIFICIAL_DELAY_MS,
  });
  logLoopPrimer();
  logDispatchMap(toolRegistry.toolNames);
  logNote(
    "This lesson keeps the s02-style loop, but the slow work is moved into a BackgroundTaskManager. The tools only start jobs and return receipts.",
  );

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemPrompt(),
    },
    {
      role: "user",
      content: userPrompt,
    },
  ];

  let totalToolCalls = 0;

  for (let round = 1; round <= MAX_ROUNDS; round += 1) {
    await flushBackgroundNotifications(manager, messages);
    logRoundStart(round, formatMessageRoleSummary(messages));

    const completion = await client.chat.completions.create({
      model: env.model,
      temperature: 0,
      tool_choice: round === 1 ? "required" : "auto",
      parallel_tool_calls: true,
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
        "Assistant requested local tool execution, so we start background jobs immediately and append only the task receipts as tool messages.",
      );

      for (const toolCall of assistantMessage.tool_calls) {
        totalToolCalls += 1;
        const toolResultText = await executeToolCall(toolRegistry, toolCall);
        const toolMessage = buildToolMessage(toolCall.id, toolResultText);

        messages.push(toolMessage);
        logTransition(
          "Only the start receipt is appended now. The heavy result will come back later through the notification queue.",
        );
      }

      continue;
    }

    if (flushReadyNotificationsImmediately(manager, messages)) {
      continue;
    }

    if (manager.hasPendingTasks()) {
      messages.push({
        role: "user",
        content:
          "Background tasks are still pending. Do not finalize yet. Wait for the remaining <background-results> notifications before answering.",
      });
      logTransition(
        "The assistant tried to answer before all background tasks finished, so we keep the loop alive and wait for the remaining notifications.",
      );
      continue;
    }

    const finalAnswer = getFinalAnswer(assistantMessage);
    logFinalAnswer(finalAnswer, totalToolCalls);
    return;
  }

  throw new Error(`Reached the round limit (${MAX_ROUNDS}) before the model finished.`);
}

await run().catch((error) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
