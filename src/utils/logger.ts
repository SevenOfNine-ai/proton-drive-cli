import chalk from 'chalk';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

class Logger {
  private level: LogLevel = LogLevel.INFO;

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  debug(...args: any[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(chalk.dim('[DEBUG]'), ...args);
    }
  }

  info(...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.blue('[INFO]'), ...args);
    }
  }

  warn(...args: any[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(chalk.yellow('[WARN]'), ...args);
    }
  }

  error(...args: any[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(chalk.red('[ERROR]'), ...args);
    }
  }

  success(...args: any[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(chalk.green('[SUCCESS]'), ...args);
    }
  }
}

export const logger = new Logger();

// Enable debug logging if DEBUG env var is set
if (process.env.DEBUG) {
  logger.setLevel(LogLevel.DEBUG);
}
