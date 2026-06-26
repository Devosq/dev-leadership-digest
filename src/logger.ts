/** Minimal structured logger (stderr) so stdout stays clean for piping. */
type Level = 'debug' | 'info' | 'warn' | 'error';

function emit(level: Level, scope: string, message: string, meta?: unknown): void {
  const line = { ts: new Date().toISOString(), level, scope, message, ...(meta ? { meta } : {}) };
  process.stderr.write(JSON.stringify(line) + '\n');
}

export const log = {
  debug: (scope: string, message: string, meta?: unknown) => emit('debug', scope, message, meta),
  info: (scope: string, message: string, meta?: unknown) => emit('info', scope, message, meta),
  warn: (scope: string, message: string, meta?: unknown) => emit('warn', scope, message, meta),
  error: (scope: string, message: string, meta?: unknown) => emit('error', scope, message, meta),
};
