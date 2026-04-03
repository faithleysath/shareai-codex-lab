import { expect, test } from "bun:test";

import { sendReport } from "../src/report/client.ts";

test("sendReport attaches an authorization header", () => {
  const result = sendReport();

  expect(result.headers.authorization).toContain("Bearer");
});
