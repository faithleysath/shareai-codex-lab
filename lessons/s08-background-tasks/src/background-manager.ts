export interface BackgroundTaskStartReceipt {
  task_id: string;
  tool_name: string;
  status: "started";
  started_at: string;
  pending_task_count: number;
  note: string;
}

export interface BackgroundTaskNotification {
  task_id: string;
  tool_name: string;
  status: "completed" | "failed";
  started_at: string;
  finished_at: string;
  duration_ms: number;
  payload: unknown;
  summary: string;
}

interface PendingTask {
  taskId: string;
  toolName: string;
  startedAt: number;
  startedAtIso: string;
}

interface StartTaskOptions {
  toolName: string;
  execute: () => Promise<unknown>;
}

export class BackgroundTaskManager {
  private readonly notifications: BackgroundTaskNotification[] = [];
  private readonly pendingTasks = new Map<string, PendingTask>();
  private readonly waiters = new Set<() => void>();

  startTask({ toolName, execute }: StartTaskOptions): BackgroundTaskStartReceipt {
    const taskId = crypto.randomUUID().slice(0, 8);
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();

    this.pendingTasks.set(taskId, {
      taskId,
      toolName,
      startedAt,
      startedAtIso,
    });

    void this.runTask({
      taskId,
      toolName,
      startedAt,
      startedAtIso,
      execute,
    });

    return {
      task_id: taskId,
      tool_name: toolName,
      status: "started",
      started_at: startedAtIso,
      pending_task_count: this.pendingTasks.size,
      note:
        "Background task started. The final result will arrive later through the notification queue and will be injected before the next model turn.",
    };
  }

  hasPendingTasks(): boolean {
    return this.pendingTasks.size > 0;
  }

  getPendingTaskCount(): number {
    return this.pendingTasks.size;
  }

  drainNotifications(): BackgroundTaskNotification[] {
    if (this.notifications.length === 0) {
      return [];
    }

    return this.notifications.splice(0, this.notifications.length);
  }

  async waitForNotifications(timeoutMs: number): Promise<BackgroundTaskNotification[]> {
    if (this.notifications.length > 0) {
      return this.drainNotifications();
    }

    if (!this.hasPendingTasks()) {
      return [];
    }

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        this.waiters.delete(onReady);
        clearTimeout(timeoutId);
      };

      const finalize = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(this.drainNotifications());
      };

      const onReady = () => {
        finalize();
      };

      const timeoutId = setTimeout(() => {
        finalize();
      }, timeoutMs);

      this.waiters.add(onReady);
    });
  }

  private async runTask(options: {
    taskId: string;
    toolName: string;
    startedAt: number;
    startedAtIso: string;
    execute: () => Promise<unknown>;
  }): Promise<void> {
    const { taskId, toolName, startedAt, startedAtIso, execute } = options;

    try {
      const payload = await execute();
      const finishedAt = Date.now();

      this.pushNotification({
        task_id: taskId,
        tool_name: toolName,
        status: "completed",
        started_at: startedAtIso,
        finished_at: new Date(finishedAt).toISOString(),
        duration_ms: finishedAt - startedAt,
        payload,
        summary: `Background task ${taskId} (${toolName}) completed successfully.`,
      });
    } catch (error) {
      const finishedAt = Date.now();

      this.pushNotification({
        task_id: taskId,
        tool_name: toolName,
        status: "failed",
        started_at: startedAtIso,
        finished_at: new Date(finishedAt).toISOString(),
        duration_ms: finishedAt - startedAt,
        payload: {
          error: error instanceof Error ? error.message : String(error),
        },
        summary: `Background task ${taskId} (${toolName}) failed.`,
      });
    } finally {
      this.pendingTasks.delete(taskId);
    }
  }

  private pushNotification(notification: BackgroundTaskNotification): void {
    this.notifications.push(notification);

    const waiters = Array.from(this.waiters);
    this.waiters.clear();

    for (const waiter of waiters) {
      waiter();
    }
  }
}
