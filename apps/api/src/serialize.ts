import type { Response } from "express";

/** JSON replacer that renders bigint as a decimal string (amounts are 1e6-scaled). */
export function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

/** Send `data` as JSON, safely stringifying any bigint fields. */
export function sendJson(res: Response, data: unknown, status = 200): void {
  res.status(status).type("application/json").send(JSON.stringify(data, bigintReplacer));
}
