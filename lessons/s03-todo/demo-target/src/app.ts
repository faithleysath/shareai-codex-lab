import { walkOneLevel } from "./lib/walk.ts";

export function buildSession() {
  const scan = walkOneLevel();

  return {
    unlockedBy: scan.password,
    route: scan.entries.join(" > "),
  };
}
