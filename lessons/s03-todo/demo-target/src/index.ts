import { buildSession } from "./app.ts";
import { formatLabel } from "./lib/format.ts";

export function main() {
  const session = buildSession();

  return {
    route: formatLabel(session.route),
    unlockedBy: session.unlockedBy,
  };
}
