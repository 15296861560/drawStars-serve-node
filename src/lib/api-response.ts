import type { Response } from "express";
import { serializeBigInt } from "./serialize";

export function sendJson(
  res: Response,
  payload: {
    status: boolean;
    msg: unknown;
    data?: unknown;
    code?: string;
  },
  httpStatus = 200,
) {
  res.status(httpStatus).json(serializeBigInt(payload));
}

export function normalizeErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return "请求失败";
}
