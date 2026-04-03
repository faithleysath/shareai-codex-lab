import { describe, expect, test } from "bun:test";

import { TodoManager } from "./todo-manager";

describe("TodoManager", () => {
  test("stores and renders a valid todo list", () => {
    const manager = new TodoManager();
    const snapshot = manager.update([
      { id: "discover", text: "Inspect the project tree", status: "completed" },
      { id: "read", text: "Read walk.ts", status: "in_progress" },
      { id: "trace", text: "Trace password usage", status: "pending" },
    ]);

    expect(snapshot.total_count).toBe(3);
    expect(snapshot.completed_count).toBe(1);
    expect(snapshot.in_progress_count).toBe(1);
    expect(snapshot.rendered).toContain("[x] discover Inspect the project tree");
    expect(snapshot.rendered).toContain("[>] read Read walk.ts");
  });

  test("rejects multiple in_progress items", () => {
    const manager = new TodoManager();

    expect(() =>
      manager.update([
        { id: "a", text: "First", status: "in_progress" },
        { id: "b", text: "Second", status: "in_progress" },
      ]),
    ).toThrow("Only one todo item may be in_progress");
  });

  test("rejects duplicate ids", () => {
    const manager = new TodoManager();

    expect(() =>
      manager.update([
        { id: "dup", text: "First", status: "pending" },
        { id: "dup", text: "Second", status: "completed" },
      ]),
    ).toThrow("Duplicate todo id");
  });
});
