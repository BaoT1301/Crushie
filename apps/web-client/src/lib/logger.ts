/**
 * Structured logging and error reporting.
 *
 * WHY THIS EXISTS
 *
 * The app had no observability at all: ~70 bare `console.log`/`console.error`
 * calls across the server, no levels, no request correlation, and no way for an
 * aggregator to parse anything. In production that means a real failure is a
 * line of prose in a log stream nobody is watching.
 *
 * WHY NO SENTRY (yet)
 *
 * Deliberately dependency-free. Vercel and Railway both ingest stdout, so
 * newline-delimited JSON is queryable the moment it deploys, with no account to
 * create, no DSN to configure, and no vendor chosen on the team's behalf.
 * `setErrorReporter` is the seam: wiring Sentry (or anything else) later is one
 * call in instrumentation, and no call site changes.
 *
 * FORMAT
 *
 * Production emits one JSON object per line — the format every log aggregator
 * understands. Development emits something a human can read, because a wall of
 * JSON in a terminal is how people learn to ignore logs.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const isProduction = process.env.NODE_ENV === "production";

/** Below this is dropped. Debug is noise in production. */
const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (isProduction ? "info" : "debug");

/**
 * Keys whose values are never safe to log.
 *
 * Context objects get built ad hoc at call sites, and it only takes one
 * `{ ...input }` spread to put a Clerk token or a base64 selfie into a log that
 * is retained for months. Redacting by key name is crude but catches the
 * realistic accidents.
 */
const REDACT_KEYS =
  /^(password|token|secret|key|authorization|cookie|jwt|apikey|api_key|selfie|selfiebase64|frame|embedding|image|base64)$/i;

/** Anything longer than this is a payload, not a log field. */
const MAX_VALUE_LENGTH = 512;

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 4) return "[truncated: too deep]";

  if (typeof value === "string") {
    return value.length > MAX_VALUE_LENGTH
      ? `${value.slice(0, MAX_VALUE_LENGTH)}… [${value.length} chars]`
      : value;
  }

  if (typeof value !== "object") return value;

  if (Array.isArray(value)) {
    const capped = value.slice(0, 20).map((v) => sanitize(v, depth + 1));
    return value.length > 20
      ? [...capped, `… ${value.length - 20} more`]
      : capped;
  }

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = REDACT_KEYS.test(key) ? "[redacted]" : sanitize(val, depth + 1);
  }
  return out;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      // Stack only in production logs, where it is the whole point. In dev the
      // console prints it anyway.
      stack: error.stack,
      ...(error.cause ? { cause: serializeError(error.cause) } : {}),
    };
  }
  return { message: String(error) };
}

function emit(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown,
) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

  const payload = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...(context ? { ctx: sanitize(context) } : {}),
    ...(error ? { err: serializeError(error) } : {}),
  };

  const sink = level === "error" ? console.error : console.log;

  if (isProduction) {
    sink(JSON.stringify(payload));
    return;
  }

  const suffix = context ? ` ${JSON.stringify(sanitize(context))}` : "";
  sink(`[${level}] ${message}${suffix}`);
  if (error) sink(error);
}

/**
 * Optional hook for shipping errors somewhere other than stdout.
 *
 * Wire a vendor here, e.g. in instrumentation.ts:
 *   setErrorReporter((error, context) => Sentry.captureException(error, { extra: context }));
 */
type ErrorReporter = (error: unknown, context?: LogContext) => void;

let errorReporter: ErrorReporter | null = null;

export function setErrorReporter(reporter: ErrorReporter | null) {
  errorReporter = reporter;
}

export const logger = {
  debug: (message: string, context?: LogContext) =>
    emit("debug", message, context),
  info: (message: string, context?: LogContext) =>
    emit("info", message, context),
  warn: (message: string, context?: LogContext) =>
    emit("warn", message, context),

  /**
   * Log an error and hand it to the reporter.
   *
   * A reporter that throws must never take down the request that was already
   * failing, so it is isolated.
   */
  error: (message: string, error?: unknown, context?: LogContext) => {
    emit("error", message, context, error);

    if (errorReporter && error) {
      try {
        errorReporter(error, { message, ...context });
      } catch (reporterError) {
        emit("warn", "error reporter threw", undefined, reporterError);
      }
    }
  },
};
