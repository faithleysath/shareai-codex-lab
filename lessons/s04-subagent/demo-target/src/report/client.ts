import { API_TOKEN } from "../config/token.ts";
import { buildPayload } from "./payload.ts";

export function sendReport() {
  return {
    endpoint: "https://metrics.example.test/collect",
    headers: {
      authorization: `Bearer ${API_TOKEN}`,
    },
    body: buildPayload(),
  };
}
