export enum LogLevel {
  Minimum = 0,
  Balanced = 1,
  Obnoxious = 2,
}

let currentLevel: LogLevel = LogLevel.Balanced;

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

export function log(level: LogLevel, ...args: any[]) {
  if (currentLevel >= level) {
    console.log(...args);
  }
}
