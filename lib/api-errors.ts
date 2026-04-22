import { NextResponse } from "next/server";

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(
    status: number,
    message: string,
    code?: string,
    details?: unknown,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown) {
  return new ApiError(400, message, "BAD_REQUEST", details);
}

export function unauthorized(message = "Unauthorized") {
  return new ApiError(401, message, "UNAUTHORIZED");
}

export function forbidden(message = "Forbidden") {
  return new ApiError(403, message, "FORBIDDEN");
}

export function notFound(message = "Not found") {
  return new ApiError(404, message, "NOT_FOUND");
}

export function conflict(message = "Conflict", details?: unknown) {
  return new ApiError(409, message, "CONFLICT", details);
}

export function handleRouteError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.status },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: "Invalid JSON body", code: "BAD_JSON" },
      { status: 400 },
    );
  }

  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}
