import { describe, expect, test } from "bun:test";

import { BackgroundTaskManager } from "./background-manager";

describe("BackgroundTaskManager", () => {
  test("starts a task immediately and publishes a completion notification later", async () => {
    const manager = new BackgroundTaskManager();
    const receipt = manager.startTask({
      toolName: "demo_async",
      async execute() {
        await Bun.sleep(5);
        return {
          ok: true,
        };
      },
    });

    expect(receipt.status).toBe("started");
    expect(receipt.tool_name).toBe("demo_async");
    expect(manager.hasPendingTasks()).toBe(true);

    const notifications = await manager.waitForNotifications(50);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.task_id).toBe(receipt.task_id);
    expect(notifications[0]?.status).toBe("completed");
    expect(notifications[0]?.payload).toEqual({ ok: true });
    expect(manager.hasPendingTasks()).toBe(false);
  });

  test("publishes a failed notification when the task throws", async () => {
    const manager = new BackgroundTaskManager();

    manager.startTask({
      toolName: "boom_async",
      async execute() {
        await Bun.sleep(1);
        throw new Error("boom");
      },
    });

    const notifications = await manager.waitForNotifications(50);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.status).toBe("failed");
    expect(notifications[0]?.payload).toEqual({ error: "boom" });
  });
});
