import { describe, expect, test } from "bun:test";

import { BackgroundTaskManager } from "./background-manager";
import { createFibonacciAsyncTool, FIBONACCI_ASYNC_TOOL_NAME } from "./fibonacci-async-tool";

describe("createFibonacciAsyncTool", () => {
  test("returns a task receipt immediately and later publishes a fibonacci result", async () => {
    const manager = new BackgroundTaskManager();
    const tool = createFibonacciAsyncTool(manager, { delayMs: 1 });

    const receipt = await tool.execute(JSON.stringify({ n: 10 }));

    expect(receipt.tool_name).toBe(FIBONACCI_ASYNC_TOOL_NAME);
    expect(receipt.requested_n).toBe(10);

    const notifications = await manager.waitForNotifications(50);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe("completed");
    expect(notifications[0]?.payload).toEqual({
      kind: "fibonacci",
      n: 10,
      sequence_definition: "F(0)=0, F(1)=1",
      value: "55",
    });
  });
});
