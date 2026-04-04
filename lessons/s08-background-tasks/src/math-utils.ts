export function ensureNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`\`${fieldName}\` must be a non-negative integer.`);
  }

  return value;
}

export function parseIntegerArgs(rawArgs: string, fieldName: string): number {
  const parsed = JSON.parse(rawArgs) as unknown;

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }

  return ensureNonNegativeInteger(
    (parsed as Record<string, unknown>)[fieldName],
    fieldName,
  );
}

export function computeFibonacciValue(n: number): bigint {
  if (n === 0) {
    return 0n;
  }

  let previous = 0n;
  let current = 1n;

  for (let index = 1; index < n; index += 1) {
    const next = previous + current;
    previous = current;
    current = next;
  }

  return current;
}

export function computeHanoiMovesValue(n: number): bigint {
  return (2n ** BigInt(n)) - 1n;
}
