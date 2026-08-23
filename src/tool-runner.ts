import type { AssessClient } from "./client.js";
import { withPaginationCursors } from "./api-paths.js";

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export function jsonResult(data: unknown, isError = false): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

export async function runTool<T>(
  client: AssessClient,
  fn: () => Promise<T>,
): Promise<ToolResult> {
  try {
    const data = await fn();
    return jsonResult(withPaginationCursors(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    let parsed: unknown = message;
    try {
      parsed = JSON.parse(message);
    } catch {
      /* keep string */
    }
    return jsonResult({ error: parsed }, true);
  }
}
