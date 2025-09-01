export type LogLevel =
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'event'
  | 'rtc'
  | 'ws'
  | 'console';
export interface LogEntry {
  ts: number;
  level: LogLevel;
  message: string;
}

const entries: LogEntry[] = [];

export function log(level: LogLevel, message: string) {
  entries.push({ ts: Date.now(), level, message });
  if (entries.length > 10000) entries.shift();
}

export function getLogLines(): string[] {
  return entries.map(
    (e) => `${new Date(e.ts).toISOString()} [${e.level}] ${e.message}`,
  );
}

export function downloadLogs() {
  const blob = new Blob([getLogLines().join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'logs.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function uploadLogs(url?: string) {
  const target =
    url || (import.meta as any).env?.VITE_LOG_UPLOAD_URL || '/logs';
  try {
    const body = getLogLines().join('\n');
    const res = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';
const originalConsole: Partial<
  Record<ConsoleMethod, (...args: any[]) => void>
> = {};

export function enableConsoleCapture() {
  (['log', 'info', 'warn', 'error', 'debug'] as ConsoleMethod[]).forEach(
    (lvl) => {
      if (originalConsole[lvl]) return;
      const orig = (console as any)[lvl].bind(console);
      originalConsole[lvl] = orig;
      (console as any)[lvl] = (...args: any[]) => {
        try {
          log(
            'console',
            args
              .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
              .join(' '),
          );
        } catch {}
        orig(...args);
      };
    },
  );
}

export function disableConsoleCapture() {
  (['log', 'info', 'warn', 'error', 'debug'] as ConsoleMethod[]).forEach(
    (lvl) => {
      const orig = originalConsole[lvl];
      if (orig) {
        (console as any)[lvl] = orig;
        delete originalConsole[lvl];
      }
    },
  );
}
