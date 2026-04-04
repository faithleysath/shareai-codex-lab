import { describe, expect, test } from "bun:test";

import { BackgroundTaskManager } from "./background-manager";
import { createHanoiAsyncTool, HANOI_ASYNC_TOOL_NAME } from "./hanoi-async-tool";

describe("createHanoiAsyncTool", () => {
  test("returns a task receipt immediately and later publishes a hanoi result", async () => {
    const manager = new BackgroundTaskManager();
    const tool = createHanoiAsyncTool(manager, { delayMs: 1 });

    const receipt = await tool.execute(JSON.stringify({ n: 8 }));

    expect(receipt.tool_name).toBe(HANOI_ASYNC_TOOL_NAME);
    expect(receipt.requested_n).toBe(8);

    const notifications = await manager.waitForNotifications(50);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe("completed");
    expect(notifications[0]?.payload).toEqual({
      kind: "hanoi",
      n: 8,
      formula: "2^n - 1",
      value: "255",
    });
  });
});
