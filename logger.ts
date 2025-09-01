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

export async function uploadLogs(endpoint: string) {
  await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lines: getLogLines() }),
  });
}

['log', 'info', 'warn', 'error', 'debug'].forEach((lvl) => {
  const orig = (console as any)[lvl];
  (console as any)[lvl] = (...args: any[]) => {
    try {
      log(
        'console',
        args
          .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' '),
      );
    } catch {}
    orig.apply(console, args);
  };
});
