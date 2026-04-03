export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  id: string;
  text: string;
  status: TodoStatus;
}

export interface TodoSnapshot {
  total_count: number;
  completed_count: number;
  in_progress_count: number;
  items: TodoItem[];
  rendered: string;
  note: string;
}

function normalizeText(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`Todo ${fieldName} cannot be empty.`);
  }

  return trimmed;
}

function renderStatus(status: TodoStatus): string {
  if (status === "completed") {
    return "[x]";
  }

  if (status === "in_progress") {
    return "[>]";
  }

  return "[ ]";
}

function renderTodos(items: TodoItem[]): string {
  if (items.length === 0) {
    return "(empty todo list)";
  }

  return items.map((item) => `${renderStatus(item.status)} ${item.id} ${item.text}`).join("\n");
}

export class TodoManager {
  #items: TodoItem[] = [];

  update(items: TodoItem[]): TodoSnapshot {
    const inProgressCount = items.filter((item) => item.status === "in_progress").length;

    if (inProgressCount > 1) {
      throw new Error("Only one todo item may be in_progress at a time.");
    }

    const ids = new Set<string>();
    const normalizedItems = items.map((item) => {
      const normalized = {
        id: normalizeText(item.id, "id"),
        text: normalizeText(item.text, "text"),
        status: item.status,
      } satisfies TodoItem;

      if (ids.has(normalized.id)) {
        throw new Error(`Duplicate todo id: ${normalized.id}`);
      }

      ids.add(normalized.id);
      return normalized;
    });

    this.#items = normalizedItems;
    return this.snapshot();
  }

  snapshot(): TodoSnapshot {
    const completedCount = this.#items.filter((item) => item.status === "completed").length;
    const inProgressCount = this.#items.filter((item) => item.status === "in_progress").length;

    return {
      total_count: this.#items.length,
      completed_count: completedCount,
      in_progress_count: inProgressCount,
      items: [...this.#items],
      rendered: renderTodos(this.#items),
      note:
        "Use todo_write to replace the full plan when progress changes. Keep exactly zero or one item in_progress.",
    };
  }
}
