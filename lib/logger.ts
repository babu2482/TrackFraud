/**
 * Structured logging utility for TrackFraud
 * 
 * Provides consistent logging across the application with:
 * - Log levels (error, warn, info, debug)
 * - JSON formatting for production
 * - Human-readable formatting for development
 * - Request ID tracking for API requests
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  module?: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const DEFAULT_LOG_LEVEL: LogLevel = 
  process.env.NODE_ENV === "production" ? "info" : "debug";

let currentLogLevel: LogLevel = DEFAULT_LOG_LEVEL;

/**
 * Update the minimum log level (useful for dynamic log level changes)
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLogLevel;
}

/**
 * Format a log entry as JSON string
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Format a log entry as human-readable string
 */
function formatText(entry: LogEntry): string {
  const prefix = `[${entry.timestamp}] ${entry.level.toUpperCase()}`;
  const module = entry.module ? ` [${entry.module}]` : "";
  const requestId = entry.requestId ? ` (req:${entry.requestId})` : "";
  return `${prefix}${module}${requestId}: ${entry.message}`;
}

/**
 * Core log function
 */
function log(level: LogLevel, message: string, meta?: Record<string, unknown>, module?: string): void {
  const levelNum = LOG_LEVELS[level];
  const minLevelNum = LOG_LEVELS[currentLogLevel];

  if (levelNum > minLevelNum) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(module && { module }),
    ...meta,
  };

  const formatted = process.env.NODE_ENV === "production" 
    ? formatJson(entry) 
    : formatText(entry);

  switch (level) {
    case "error":
      console.error(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "debug":
      console.debug(formatted);
      break;
  }
}

// ============================================
// Logger namespace object
// ============================================

export const logger = {
  error: (message: string, meta?: Record<string, unknown>, module?: string): void =>
    log("error", message, meta, module),

  warn: (message: string, meta?: Record<string, unknown>, module?: string): void =>
    log("warn", message, meta, module),

  info: (message: string, meta?: Record<string, unknown>, module?: string): void =>
    log("info", message, meta, module),

  debug: (message: string, meta?: Record<string, unknown>, module?: string): void =>
    log("debug", message, meta, module),

  /**
   * Create a child logger with pre-populated metadata
   */
  child: (meta: Record<string, unknown>, module?: string) => ({
    error: (message: string, extraMeta?: Record<string, unknown>) =>
      log("error", message, { ...meta, ...extraMeta }, module),
    warn: (message: string, extraMeta?: Record<string, unknown>) =>
      log("warn", message, { ...meta, ...extraMeta }, module),
    info: (message: string, extraMeta?: Record<string, unknown>) =>
      log("info", message, { ...meta, ...extraMeta }, module),
    debug: (message: string, extraMeta?: Record<string, unknown>) =>
      log("debug", message, { ...meta, ...extraMeta }, module),
  }),
};

// ============================================
// Request ID middleware for Next.js API routes
// ============================================

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Extract request ID from headers or generate new one
 */
export function getRequestID(headers: Headers | Record<string, string>): string {
  const headerKey = Object.keys(headers).find(
    k => k.toLowerCase() === "x-request-id"
  );
  return headerKey ? (headers as Record<string, string>)[headerKey] : generateRequestId();
}