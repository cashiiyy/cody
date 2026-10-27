'use strict';

const { app } = require('electron');
const path = require('path');
const fse = require('fs-extra');

const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor() {
    this._level = 'info';
    this._logPath = null;
    this._initialized = false;
  }

  setLevel(level) {
    if (LEVEL_ORDER[level] !== undefined) this._level = level;
  }

  _getLogPath() {
    if (!this._logPath) {
      try {
        const logsDir = app ? app.getPath('logs') : path.join(process.cwd(), 'logs');
        this._logPath = path.join(logsDir, 'cody.log');
        fse.ensureDirSync(path.dirname(this._logPath));
      } catch {
        this._logPath = path.join(process.cwd(), 'cody.log');
      }
    }
    return this._logPath;
  }

  _write(level, message, meta) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this._level]) return;
    const ts = new Date().toISOString();
    const entry = { ts, level, message, ...(meta ? { meta } : {}) };
    const line = JSON.stringify(entry) + '\n';
    const prefix = `[${ts}] [${level.toUpperCase().padEnd(5)}] ${message}`;
    if (level === 'error') {
      process.stderr.write(prefix + (meta ? ' ' + JSON.stringify(meta) : '') + '\n');
    } else {
      process.stdout.write(prefix + (meta ? ' ' + JSON.stringify(meta) : '') + '\n');
    }
    // Non-blocking file write
    try {
      fse.appendFileSync(this._getLogPath(), line);
    } catch { /* ignore log file errors */ }
  }

  debug(msg, meta) { this._write('debug', msg, meta); }
  info(msg, meta)  { this._write('info',  msg, meta); }
  warn(msg, meta)  { this._write('warn',  msg, meta); }
  error(msg, meta) { this._write('error', msg, meta); }
}

const logger = new Logger();
module.exports = logger;
