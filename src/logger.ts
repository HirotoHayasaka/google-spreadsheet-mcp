/**
 * Logging utility for Google Spreadsheet MCP server
 * Provides structured logging with MCP notification support
 */

export type LogLevel =
  | 'debug'
  | 'info'
  | 'notice'
  | 'warning'
  | 'error'
  | 'critical'
  | 'alert'
  | 'emergency';

export const LogLevelValues = {
  DEBUG: 'debug' as const,
  INFO: 'info' as const,
  NOTICE: 'notice' as const,
  WARNING: 'warning' as const,
  ERROR: 'error' as const,
  CRITICAL: 'critical' as const,
  ALERT: 'alert' as const,
  EMERGENCY: 'emergency' as const,
} as const;

interface LoggerState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpServer: any | null;
}

const state: LoggerState = {
  mcpServer: null,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setServer(server: any): void {
  state.mcpServer = server;
}

function formatMessage(level: LogLevel, msg: string): string {
  return `[${level.toUpperCase()}] ${msg}`;
}

function sendNotification(level: LogLevel, msg: string): void {
  if (!state.mcpServer?.notification) {
    return;
  }

  try {
    state.mcpServer.notification({
      method: 'notifications/logging',
      params: {
        level,
        data: msg,
      },
    });
  } catch (error) {
    console.error(`Log notification failed: ${error}`);
  }
}

function log(level: LogLevel, msg: string): void {
  const formatted = formatMessage(level, msg);
  console.error(formatted);
  sendNotification(level, msg);
}

function debug(msg: string): void {
  log('debug', msg);
}

function info(msg: string): void {
  log('info', msg);
}

function warning(msg: string): void {
  log('warning', msg);
}

function error(msg: string): void {
  log('error', msg);
}

export const logger = {
  setServer,
  debug,
  info,
  warning,
  error,
  log,
};
