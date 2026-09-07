import { randomUUID } from "crypto";
import type { NextFunction, Response } from "express";
import type { RequestWithId } from "../interfaces/request-with-id.interface";

export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
) {
  const incomingRequestId = req.headers["x-request-id"];

  const requestId =
    typeof incomingRequestId === "string" && incomingRequestId.trim()
      ? incomingRequestId
      : randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}