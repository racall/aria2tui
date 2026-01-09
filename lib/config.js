import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 配置文件读写
 */

export function parseArgs(argv) {
  const args = {
    bin: process.env.ARIA2_BIN || 'aria2c',
    config: process.env.ARIA2TUI_CONFIG || path.join(os.homedir(), '.aria2tui.json'),
    history: process.env.ARIA2TUI_HISTORY || path.join(os.homedir(), '.aria2tui_history.json'),
    help: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--bin' && argv[i + 1]) args.bin = argv[++i];
    else if (a === '--config' && argv[i + 1]) args.config = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

export function readJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

export function getDefaults() {
  return {
    uris: [],
    dir: path.join(os.homedir(), 'Downloads'),
    out: '',
    continue: true,
    maxConcurrentDownloads: 5,
    split: 16,
    maxConnectionPerServer: 16,
    maxDownloadLimit: '',
    maxUploadLimit: '',
    fileAllocation: 'none',
    checkCertificate: true,
    enableMmap: true,
    followTorrent: true,
    seedTime: 0,
    userAgent: '',
    inputFile: '',
    extraArgs: '',
  };
}
