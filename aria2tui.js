#!/usr/bin/env node
'use strict';

/**
 * aria2tui - a dependency-free terminal UI to quickly set aria2c parameters
 * and then execute the aria2c command.
 */

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ANSI = {
  clear: '\x1b[2J',
  home: '\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  reset: '\x1b[0m',
  inverse: '\x1b[7m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  underline: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
}

function padRight(s, w) {
  const raw = stripAnsi(s);
  if (raw.length >= w) return s;
  return s + ' '.repeat(w - raw.length);
}

function trunc(s, w) {
  const raw = stripAnsi(s);
  if (raw.length <= w) return s;
  return raw.slice(0, Math.max(0, w - 1)) + '…';
}

function drawSeparator(width, char = '─') {
  return char.repeat(Math.max(0, width));
}

function drawGroupHeader(title, width) {
  if (width < 10) return trunc(title, width);
  const leftPad = 1;
  const rightFill = Math.max(0, width - leftPad - stripAnsi(title).length - 1);
  return ANSI.cyan + ANSI.bold + '─' + title + '─'.repeat(rightFill) + ANSI.reset;
}

function safeWrite(s) {
  process.stdout.write(s);
}

function getTerminalSize() {
  return { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
}

function parseArgs(argv) {
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

function usage() {
  return [
    'aria2tui - 终端界面生成并执行 aria2c 命令',
    '',
    'Usage:',
    '  ./aria2tui.js [--bin aria2c] [--config /path/to/config.json]',
    '',
    'Env:',
    '  ARIA2_BIN          aria2c binary path/name (default: aria2c)',
    '  ARIA2TUI_CONFIG    config file path (default: ~/.aria2tui.json)',
    '',
    'Keys:',
    '  ↑/↓(j/k) 选择   Enter 编辑/执行   Space 开关',
    '  u URIs  t 种子  p 预览  r 运行  s 保存  q 退出  Esc 返回',
    '',
  ].join('\n');
}

function readJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function shellEscape(arg) {
  if (arg === '') return "''";
  return `'${String(arg).replace(/'/g, `'\"'\"'`)}'`;
}

function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null || v === undefined) return '';
  return String(v);
}

function parseShellWords(input) {
  const s = String(input || '');
  const out = [];
  let cur = '';
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  while (i < s.length) {
    const ch = s[i];
    if (!inDouble && ch === "'" && !inSingle) {
      inSingle = true;
      i++;
      continue;
    }
    if (inSingle && ch === "'") {
      inSingle = false;
      i++;
      continue;
    }
    if (!inSingle && ch === '"' && !inDouble) {
      inDouble = true;
      i++;
      continue;
    }
    if (inDouble && ch === '"') {
      inDouble = false;
      i++;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (cur.length > 0) out.push(cur);
      cur = '';
      while (i < s.length && /\s/.test(s[i])) i++;
      continue;
    }
    if (!inSingle && ch === '\\' && i + 1 < s.length) {
      cur += s[i + 1];
      i += 2;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

function buildArgsFromConfig(cfg) {
  const args = [];
  const pushKV = (flag, value) => {
    if (value === '' || value === null || value === undefined) return;
    args.push(flag, String(value));
  };
  const pushBool = (flag, enabled) => {
    if (enabled) args.push(flag);
  };
  const pushLongKV = (flag, value) => {
    if (value === '' || value === null || value === undefined) return;
    args.push(`${flag}=${String(value)}`);
  };

  pushKV('-d', cfg.dir);
  pushKV('-o', cfg.out);
  pushBool('-c', !!cfg.continue);
  pushKV('-j', cfg.maxConcurrentDownloads);
  pushKV('-s', cfg.split);
  pushKV('-x', cfg.maxConnectionPerServer);
  pushLongKV('--max-download-limit', cfg.maxDownloadLimit);
  pushLongKV('--max-upload-limit', cfg.maxUploadLimit);
  pushLongKV('--file-allocation', cfg.fileAllocation);
  pushLongKV('--check-certificate', cfg.checkCertificate ? 'true' : 'false');
  pushLongKV('--enable-mmap', cfg.enableMmap ? 'true' : 'false');
  pushLongKV('--follow-torrent', cfg.followTorrent ? 'true' : 'false');
  pushLongKV('--seed-time', cfg.seedTime);
  pushKV('-U', cfg.userAgent);

  if (cfg.torrentFile) args.push('-T', cfg.torrentFile);
  if (cfg.inputFile) args.push('--input-file', cfg.inputFile);

  const extra = parseShellWords(cfg.extraArgs || '');
  args.push(...extra);

  const uris = Array.isArray(cfg.uris) ? cfg.uris.filter(Boolean) : [];
  args.push(...uris);

  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    // eslint-disable-next-line no-console
    console.log(usage());
    process.exit(0);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    // eslint-disable-next-line no-console
    console.error('This tool needs a TTY (run in a real terminal).');
    process.exit(1);
  }

  const defaults = {
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
    torrentFile: '',
    inputFile: '',
    extraArgs: '',
  };

  const loaded = readJson(args.config);
  const cfg = { ...defaults, ...(loaded && typeof loaded === 'object' ? loaded : {}) };

  // 历史记录功能
  let history = [];
  function loadHistory() {
    const data = readJson(args.history);
    if (Array.isArray(data)) {
      history = data.slice(0, 20); // 最多保留 20 条
    }
  }

  function saveHistory() {
    try {
      writeJson(args.history, history);
    } catch (e) {
      // 忽略保存失败
    }
  }

  function addToHistory(config, status = 'pending') {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      config: { ...config },
      status, // pending | completed | failed
      filename: config.out || 'unknown',
      url: Array.isArray(config.uris) && config.uris.length > 0 ? config.uris[0] : config.torrentFile || config.inputFile || '',
    };

    // 移除相同 URL 的旧记录
    history = history.filter(h => h.url !== entry.url);
    history.unshift(entry);
    history = history.slice(0, 20);
    saveHistory();
  }

  function updateHistoryStatus(id, status) {
    const entry = history.find(h => h.id === id);
    if (entry) {
      entry.status = status;
      saveHistory();
    }
  }

  loadHistory();

  const fields = [
    // 输入源
    { key: 'uris', label: '下载链接 (u)', type: 'list', group: 'input', description: '设置下载 URL，可以设置多个，空格分隔', hint: '空格分隔' },
    { key: 'torrentFile', label: '种子文件 (t)', type: 'string', group: 'input', description: '指定 .torrent 文件的路径', hint: '文件路径' },
    { key: 'inputFile', label: '输入文件', type: 'string', group: 'input', description: 'aria2 输入文件，包含多个 URL 或种子文件路径', hint: '文件路径' },

    // 保存设置
    { key: 'dir', label: '保存目录 (-d)', type: 'string', group: 'save', description: '设置文件保存目录，留空则保存到当前目录', hint: '绝对或相对路径' },
    { key: 'out', label: '输出文件名 (-o)', type: 'string', group: 'save', description: '指定输出文件的名称（仅适用于单文件下载）', hint: '文件名' },
    { key: 'continue', label: '断点续传 (-c)', type: 'bool', group: 'save', description: '支持断点续传，继续之前未完成的下载', hint: '' },

    // 性能优化
    { key: 'maxConcurrentDownloads', label: '并发任务 (-j)', type: 'number', group: 'performance', description: '同时进行的下载任务数量', hint: '推荐 1-10' },
    { key: 'split', label: '分片数 (-s)', type: 'number', group: 'performance', description: '单个文件的分片数量，提升下载速度', hint: '推荐 16-64' },
    { key: 'maxConnectionPerServer', label: '单服连接 (-x)', type: 'number', group: 'performance', description: '单个服务器的最大连接数', hint: '推荐 1-16' },
    { key: 'fileAllocation', label: '文件预分配', type: 'enum', options: ['none', 'prealloc', 'trunc', 'falloc'], group: 'performance', description: '文件预分配方式，影响磁盘空间占用和性能', hint: '' },
    { key: 'enableMmap', label: '启用 mmap', type: 'bool', group: 'performance', description: '使用内存映射 I/O，可能提升性能', hint: '' },

    // 限速控制
    { key: 'maxDownloadLimit', label: '下载限速', type: 'string', group: 'limit', description: '限制最大下载速度（留空为不限速）', hint: '如 10M, 1G' },
    { key: 'maxUploadLimit', label: '上传限速', type: 'string', group: 'limit', description: '限制最大上传速度（用于 BT）', hint: '如 1M, 500K' },

    // 种子设置
    { key: 'followTorrent', label: '跟随种子', type: 'bool', group: 'torrent', description: '下载种子文件后自动开始下载种子内容', hint: '' },
    { key: 'seedTime', label: '做种时间(分钟)', type: 'number', group: 'torrent', description: 'BT 下载完成后做种时长，0 表示不做种', hint: '分钟' },

    // 高级选项
    { key: 'userAgent', label: 'User-Agent (-U)', type: 'string', group: 'advanced', description: '自定义 HTTP User-Agent 字符串', hint: '' },
    { key: 'checkCertificate', label: '校验证书', type: 'bool', group: 'advanced', description: 'HTTPS 连接时验证服务器证书', hint: '' },
    { key: 'extraArgs', label: '额外参数', type: 'string', group: 'advanced', description: '其他 aria2c 命令行参数，原样拼接', hint: '原样拼接' },

    // 操作
    { key: '__run__', label: ANSI.green + '执行 aria2c (r/Enter)' + ANSI.reset, type: 'action', group: 'action', description: '执行 aria2c 命令开始下载', hint: '' },
  ];

  const state = {
    mode: 'list', // list | prompt | preview
    view: 'history', // history | groups | fields
    currentGroup: null, // 当前所在的分组
    selected: 0,
    prompt: { label: '', hint: '', value: '', targetKey: '', validation: { valid: true, message: '' } },
    message: '',
    messageType: 'info', // info | success | warning | error
    messageAt: 0,
    inputSourceSet: false, // 是否已设置输入源
    currentHistoryId: null, // 当前恢复的历史记录 ID
  };

  function setMessage(msg, type = 'info') {
    const icons = {
      success: ANSI.green + '✓ ' + ANSI.reset,
      warning: ANSI.yellow + '⚠ ' + ANSI.reset,
      error: ANSI.red + '✗ ' + ANSI.reset,
      info: '',
    };
    state.message = (icons[type] || '') + msg;
    state.messageType = type;
    state.messageAt = Date.now();
  }

  function checkInputSource() {
    const hasUris = Array.isArray(cfg.uris) && cfg.uris.length > 0;
    const hasTorrent = cfg.torrentFile && cfg.torrentFile.trim() !== '';
    const hasInputFile = cfg.inputFile && cfg.inputFile.trim() !== '';
    state.inputSourceSet = hasUris || hasTorrent || hasInputFile;
    return state.inputSourceSet;
  }

  const groupDefinitions = [
    { key: 'input', name: '输入源', icon: '🔗', description: '设置下载 URL、种子文件或输入文件', required: true },
    { key: 'save', name: '保存设置', icon: '💾', description: '设置保存目录、文件名和断点续传' },
    { key: 'performance', name: '性能优化', icon: '⚡', description: '调整并发、分片、连接数等性能参数' },
    { key: 'limit', name: '限速控制', icon: '🚦', description: '限制下载和上传速度' },
    { key: 'torrent', name: '种子设置', icon: '🌱', description: 'BT 下载相关设置' },
    { key: 'advanced', name: '高级选项', icon: '⚙️', description: 'User-Agent、证书校验等高级选项' },
    { key: 'action', name: '执行下载', icon: '▶️', description: '预览和执行 aria2c 命令' },
  ];

  function getGroupSummary(groupKey) {
    const groupFields = fields.filter(f => f.group === groupKey);
    const setCount = groupFields.filter(f => {
      const val = cfg[f.key];
      if (f.type === 'list') return Array.isArray(val) && val.length > 0;
      if (f.type === 'bool') return true; // bool 总是有值
      if (f.type === 'action') return false;
      return val !== '' && val !== null && val !== undefined;
    }).length;
    const totalCount = groupFields.filter(f => f.type !== 'action').length;
    return `${setCount}/${totalCount}`;
  }

  function buildExpandedRows() {
    const groupNames = {
      input: '输入源',
      save: '保存设置',
      performance: '性能优化',
      limit: '限速控制',
      torrent: '种子设置',
      advanced: '高级选项',
      action: '操作',
    };
    const expandedRows = [];
    let currentGroup = null;
    for (const f of fields) {
      if (f.group !== currentGroup) {
        currentGroup = f.group;
        const groupTitle = groupNames[currentGroup] || currentGroup;
        expandedRows.push({ type: 'group', title: groupTitle });
      }
      expandedRows.push({ type: 'field', field: f });
    }
    return expandedRows;
  }

  function getFieldAtIndex(expandedRows, index) {
    if (index < 0 || index >= expandedRows.length) return null;
    const row = expandedRows[index];
    return row.type === 'field' ? row.field : null;
  }

  function renderList() {
    if (state.view === 'history') {
      renderHistoryView();
    } else if (state.view === 'groups') {
      renderGroupsView();
    } else {
      renderFieldsView();
    }
  }

  function renderHistoryView() {
    const { cols, rows } = getTerminalSize();
    const now = Date.now();
    const msg = state.message && now - state.messageAt < 4000 ? state.message : '';

    const header = trunc(ANSI.bold + 'aria2tui - 下载历史' + ANSI.reset, cols);
    const sub = trunc(ANSI.dim + '↑/↓ 选择  Enter 恢复  n 新建  d 删除  q 退出' + ANSI.reset, cols);

    const lines = [];
    lines.push(header);
    lines.push(sub);
    lines.push('');

    if (history.length === 0) {
      lines.push(ANSI.dim + '  暂无下载历史' + ANSI.reset);
      lines.push('');
      lines.push(ANSI.cyan + '  按 n 开始新的下载' + ANSI.reset);
    } else {
      // 添加"新建下载"选项
      const newDownload = '  ' + ANSI.green + '+ 新建下载' + ANSI.reset;
      if (state.selected === 0) {
        lines.push(ANSI.brightCyan + '► ' + ANSI.reset + newDownload.slice(2));
      } else {
        lines.push(newDownload);
      }

      // 显示历史记录
      for (let i = 0; i < Math.min(history.length, 15); i++) {
        const h = history[i];
        const date = new Date(h.timestamp);
        const timeStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

        let statusIcon = '';
        if (h.status === 'completed') {
          statusIcon = ANSI.green + '✓' + ANSI.reset;
        } else if (h.status === 'failed') {
          statusIcon = ANSI.red + '✗' + ANSI.reset;
        } else {
          statusIcon = ANSI.yellow + '⋯' + ANSI.reset;
        }

        const filename = trunc(h.filename || 'unknown', 40);
        const url = trunc(h.url, Math.max(30, cols - 65));
        const pointer = state.selected === i + 1 ? ANSI.brightCyan + '► ' + ANSI.reset : '  ';

        const rowText = `${pointer}${statusIcon} ${ANSI.dim}[${timeStr}]${ANSI.reset} ${ANSI.white}${filename}${ANSI.reset}`;
        lines.push(trunc(rowText, cols));
        lines.push(trunc(`    ${ANSI.dim}${url}${ANSI.reset}`, cols));
      }
    }

    lines.push('');
    lines.push(ANSI.dim + drawSeparator(cols) + ANSI.reset);

    // 帮助信息
    let helpText = msg || '';
    if (!msg) {
      if (state.selected === 0 || history.length === 0) {
        helpText = ANSI.cyan + '💡 开始新的下载任务' + ANSI.reset;
      } else if (state.selected > 0 && state.selected <= history.length) {
        const h = history[state.selected - 1];
        if (h.status === 'completed') {
          helpText = ANSI.yellow + '⚠️  此文件已下载完成，恢复将重新下载' + ANSI.reset;
        } else if (h.status === 'failed') {
          helpText = ANSI.cyan + '💡 此下载曾失败，可尝试重新下载' + ANSI.reset;
        } else {
          helpText = ANSI.cyan + '💡 恢复未完成的下载' + ANSI.reset;
        }
      }
    }
    lines.push(trunc(helpText, cols));
    lines.push('');

    while (lines.length < rows) lines.push('');
    safeWrite(ANSI.hideCursor + ANSI.clear + ANSI.home + lines.slice(0, rows).join('\n'));
  }

  function renderGroupsView() {
    const { cols, rows } = getTerminalSize();
    const now = Date.now();
    const msg = state.message && now - state.messageAt < 4000 ? state.message : '';

    checkInputSource();

    const header = trunc(ANSI.bold + 'aria2tui - 配置向导' + ANSI.reset, cols);
    const sub = trunc(ANSI.dim + '↑/↓ 选择分组  Enter 进入  p 预览  r 运行  s 保存  q 退出' + ANSI.reset, cols);

    const lines = [];
    lines.push(header);
    lines.push(sub);
    lines.push('');

    // 显示分组列表
    for (let i = 0; i < groupDefinitions.length; i++) {
      const group = groupDefinitions[i];
      const isLocked = group.key !== 'input' && !state.inputSourceSet;

      let statusIcon = '';
      if (group.key === 'input') {
        statusIcon = state.inputSourceSet ? ANSI.green + '✓' + ANSI.reset : ANSI.yellow + '!' + ANSI.reset;
      } else if (group.key === 'action') {
        statusIcon = state.inputSourceSet ? ANSI.green + '▶' + ANSI.reset : ANSI.dim + '▶' + ANSI.reset;
      } else {
        statusIcon = isLocked ? ANSI.dim + '🔒' + ANSI.reset : ANSI.white + '▸' + ANSI.reset;
      }

      const summary = group.key !== 'action' ? ` ${ANSI.dim}[${getGroupSummary(group.key)}]${ANSI.reset}` : '';
      const lockHint = isLocked ? ANSI.dim + ' (需先设置输入源)' + ANSI.reset : '';

      // 选中行添加 ► 指示符
      const pointer = i === state.selected ? ANSI.brightCyan + '► ' + ANSI.reset : '  ';
      const rowText = `${pointer}${statusIcon} ${group.icon} ${group.name}${summary}${lockHint}`;

      lines.push(trunc(rowText, cols));
    }

    lines.push('');
    lines.push(ANSI.dim + drawSeparator(cols) + ANSI.reset);

    // 显示当前选中分组的描述
    let helpText = msg || '';
    if (!msg && state.selected >= 0 && state.selected < groupDefinitions.length) {
      const group = groupDefinitions[state.selected];
      helpText = ANSI.cyan + '💡 ' + group.description + ANSI.reset;
    }
    lines.push(trunc(helpText, cols));
    lines.push('');

    while (lines.length < rows) lines.push('');
    safeWrite(ANSI.hideCursor + ANSI.clear + ANSI.home + lines.slice(0, rows).join('\n'));
  }

  function renderFieldsView() {
    const { cols, rows } = getTerminalSize();
    const now = Date.now();
    const msg = state.message && now - state.messageAt < 4000 ? state.message : '';

    const currentGroupDef = groupDefinitions.find(g => g.key === state.currentGroup);
    const groupName = currentGroupDef ? currentGroupDef.name : '未知分组';

    const header = trunc(ANSI.bold + `${groupName}` + ANSI.reset, cols);
    const sub = trunc(ANSI.dim + '↑/↓ 选择  Enter 编辑  Space 开关  Esc 返回  q 退出' + ANSI.reset, cols);

    const lines = [];
    lines.push(header);
    lines.push(sub);
    lines.push('');

    // 获取当前分组的字段
    const groupFields = fields.filter(f => f.group === state.currentGroup);

    const labelW = Math.min(36, Math.max(18, Math.floor(cols * 0.35)));
    for (let i = 0; i < groupFields.length; i++) {
      const f = groupFields[i];
      let value = '';
      if (f.type === 'list') {
        const list = Array.isArray(cfg[f.key]) ? cfg[f.key] : [];
        value = list.length ? list.join(' ') : '';
      } else if (f.type === 'action') {
        value = '';
      } else {
        value = formatValue(cfg[f.key]);
      }

      if (f.type === 'enum') {
        value = value || '';
      }

      // 添加图标
      let icon = '▸';
      if (f.type === 'bool') {
        icon = cfg[f.key] ? ANSI.green + '✓' + ANSI.reset : ANSI.red + '✗' + ANSI.reset;
      } else if (f.type === 'action') {
        icon = ANSI.yellow + '►' + ANSI.reset;
      }

      // 值的颜色
      let coloredValue = value;
      if (value) {
        if (f.type === 'number') {
          coloredValue = ANSI.cyan + value + ANSI.reset;
        } else if (f.type === 'enum') {
          coloredValue = ANSI.magenta + value + ANSI.reset;
        } else if (f.type !== 'bool' && f.type !== 'action') {
          coloredValue = ANSI.white + value + ANSI.reset;
        }
      } else {
        coloredValue = ANSI.dim + '(空)' + ANSI.reset;
      }

      // 选中行添加 ► 指示符
      const pointer = i === state.selected ? ANSI.brightCyan + '► ' + ANSI.reset : '  ';
      const left = icon + ' ' + f.label;
      const rowText = `${pointer}${padRight(trunc(left, labelW), labelW)} : ${trunc(coloredValue, Math.max(0, cols - labelW - 3))}`;
      lines.push(trunc(rowText, cols));
    }

    lines.push('');
    lines.push(ANSI.dim + drawSeparator(cols) + ANSI.reset);

    // 动态帮助栏
    let helpText = msg || ANSI.dim + '按 Esc 返回分组列表  按 s 保存配置' + ANSI.reset;
    if (!msg && state.selected >= 0 && state.selected < groupFields.length) {
      const f = groupFields[state.selected];
      if (f.description) {
        helpText = ANSI.cyan + '💡 ' + f.description + ANSI.reset;
      }
    }
    lines.push(trunc(helpText, cols));
    lines.push('');

    while (lines.length < rows) lines.push('');
    safeWrite(ANSI.hideCursor + ANSI.clear + ANSI.home + lines.slice(0, rows).join('\n'));
  }

  function renderPrompt() {
    const { cols, rows } = getTerminalSize();
    const label = state.prompt.label || 'Input';
    const hint = state.prompt.hint ? ` (${state.prompt.hint})` : '';
    const lines = [];
    lines.push(trunc(`aria2tui  编辑`, cols));
    lines.push(trunc(ANSI.dim + 'Enter 确认  Esc 取消  Backspace 删除' + ANSI.reset, cols));
    lines.push('');
    lines.push(trunc(`${label}${hint}:`, cols));
    lines.push(trunc(state.prompt.value, cols));

    // 显示验证结果
    const validation = state.prompt.validation;
    if (validation && validation.message) {
      let color = ANSI.gray;
      if (!validation.valid) color = ANSI.red;
      else if (validation.warning) color = ANSI.yellow;
      else color = ANSI.green;
      lines.push(trunc(color + validation.message + ANSI.reset, cols));
    } else {
      lines.push('');
    }

    while (lines.length < rows) lines.push('');
    safeWrite(ANSI.hideCursor + ANSI.clear + ANSI.home + lines.slice(0, rows).join('\n'));
  }

  function renderPreview() {
    const { cols, rows } = getTerminalSize();
    const cmdArgs = buildArgsFromConfig(cfg);
    const lines = [];

    const title = '命令预览';
    lines.push(drawGroupHeader(title, cols));
    lines.push(trunc(ANSI.dim + 'Enter/r 执行  Esc 返回  q 退出' + ANSI.reset, cols));
    lines.push('');

    // 语法高亮的命令输出
    const parts = [args.bin, ...cmdArgs];
    let cur = ANSI.brightYellow + parts[0] + ANSI.reset;
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      let coloredPart;
      if (part.startsWith('-')) {
        // 标志用 cyan 颜色
        coloredPart = ANSI.cyan + shellEscape(part) + ANSI.reset;
      } else {
        // 值用 white 颜色
        coloredPart = ANSI.white + shellEscape(part) + ANSI.reset;
      }

      const nextLen = stripAnsi(cur).length + 1 + stripAnsi(coloredPart).length;
      if (nextLen > cols - 2) {
        lines.push(trunc(cur, cols));
        cur = '  ' + coloredPart;
      } else {
        cur = cur + ' ' + coloredPart;
      }
    }
    if (cur) lines.push(trunc(cur, cols));

    lines.push('');
    lines.push(trunc(ANSI.dim + drawSeparator(cols) + ANSI.reset, cols));

    while (lines.length < rows) lines.push('');
    safeWrite(ANSI.hideCursor + ANSI.clear + ANSI.home + lines.slice(0, rows).join('\n'));
  }

  function render() {
    if (state.mode === 'confirm') renderConfirm();
    else if (state.mode === 'prompt') renderPrompt();
    else if (state.mode === 'preview') renderPreview();
    else renderList();
  }

  function renderConfirm() {
    const { cols, rows } = getTerminalSize();
    const lines = [];
    lines.push(trunc(ANSI.bold + '确认操作' + ANSI.reset, cols));
    lines.push('');
    lines.push(trunc(ANSI.yellow + '⚠️  此文件已下载完成' + ANSI.reset, cols));
    lines.push('');
    lines.push(trunc('确定要重新下载吗？', cols));
    lines.push('');
    lines.push(trunc(ANSI.green + '  [y] 是，重新下载' + ANSI.reset, cols));
    lines.push(trunc(ANSI.red + '  [n] 否，取消' + ANSI.reset, cols));
    while (lines.length < rows) lines.push('');
    safeWrite(ANSI.hideCursor + ANSI.clear + ANSI.home + lines.slice(0, rows).join('\n'));
  }

  function beginPrompt(targetKey, label, hint, initialValue) {
    state.mode = 'prompt';
    state.prompt = {
      targetKey,
      label,
      hint: hint || '',
      value: String(initialValue ?? ''),
      validation: { valid: true, message: '' }
    };
    validatePromptValue();
    render();
  }

  function validatePromptValue() {
    const key = state.prompt.targetKey;
    const f = fields.find((x) => x.key === key);
    if (!f) return;
    const raw = state.prompt.value;

    // 空值总是有效的（除非字段是必填的，但我们这里没有必填字段）
    if (!raw || raw.trim() === '') {
      state.prompt.validation = { valid: true, message: '' };
      return;
    }

    if (f.type === 'number') {
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        state.prompt.validation = { valid: false, message: '必须是有效数字' };
        return;
      }
      state.prompt.validation = { valid: true, message: '✓ 有效数字' };
      return;
    }

    if (f.type === 'string' && (f.key === 'dir' || f.key === 'torrentFile' || f.key === 'inputFile')) {
      if (fs.existsSync(raw)) {
        state.prompt.validation = { valid: true, message: '✓ 路径存在' };
      } else {
        state.prompt.validation = { valid: true, message: '⚠ 路径不存在（将在下载时创建或报错）', warning: true };
      }
      return;
    }

    if (f.key === 'maxDownloadLimit' || f.key === 'maxUploadLimit') {
      if (/^\d+[KMG]?$/i.test(raw)) {
        state.prompt.validation = { valid: true, message: '✓ 格式正确' };
      } else {
        state.prompt.validation = { valid: false, message: '格式错误，应为如 10M, 1G, 500K' };
      }
      return;
    }

    state.prompt.validation = { valid: true, message: '' };
  }

  function cleanupTty() {
    try {
      safeWrite(ANSI.showCursor + ANSI.reset);
    } catch {}
    try {
      if (process.stdin.isTTY) process.stdin.setRawMode(false);
    } catch {}
  }

  async function runAria2c() {
    const cmdArgs = buildArgsFromConfig(cfg);
    if (!cmdArgs.some((x) => typeof x === 'string' && x.length > 0 && !x.startsWith('-')) && !cfg.torrentFile && !cfg.inputFile) {
      setMessage('未设置输入：按 u 填链接，或按 t 选种子，或设置输入文件', 'warning');
      render();
      return;
    }

    // 保存到历史记录
    const historyId = state.currentHistoryId || Date.now();
    addToHistory(cfg, 'pending');
    state.currentHistoryId = historyId;

    cleanupTty();
    safeWrite('\n');
    const child = spawn(args.bin, cmdArgs, { stdio: 'inherit' });
    child.on('exit', (code, signal) => {
      if (code === 0) {
        updateHistoryStatus(historyId, 'completed');
      } else {
        updateHistoryStatus(historyId, 'failed');
      }
      if (signal) process.exit(128);
      process.exit(code == null ? 1 : code);
    });
    child.on('error', (e) => {
      updateHistoryStatus(historyId, 'failed');
      // eslint-disable-next-line no-console
      console.error(String(e && e.message ? e.message : e));
      process.exit(1);
    });
  }

  function saveConfig() {
    const toSave = { ...cfg };
    writeJson(args.config, toSave);
    setMessage(`已保存：${args.config}`, 'success');
  }

  function toggleField(f) {
    if (f.type !== 'bool') return;
    cfg[f.key] = !cfg[f.key];
  }

  function bumpEnum(f) {
    if (f.type !== 'enum' || !Array.isArray(f.options)) return;
    const cur = String(cfg[f.key] || '');
    const idx = f.options.indexOf(cur);
    cfg[f.key] = f.options[(idx + 1) % f.options.length];
  }

  function applyPromptValue() {
    const key = state.prompt.targetKey;
    const f = fields.find((x) => x.key === key);
    if (!f) return;
    const raw = state.prompt.value;
    if (f.type === 'number') {
      const v = Number(raw);
      if (!Number.isFinite(v)) {
        setMessage('数字格式不正确', 'error');
        return;
      }
      cfg[key] = v;
      return;
    }
    if (f.type === 'bool') {
      cfg[key] = raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
      return;
    }
    if (f.type === 'list') {
      cfg[key] = String(raw || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

      // 如果是输入源字段，检查是否有效并自动返回
      if (f.group === 'input' && state.currentGroup === 'input') {
        checkInputSource();
        if (state.inputSourceSet) {
          autoExtractFilename();
          // 延迟一帧后返回分组菜单，让用户看到成功提示
          setTimeout(() => {
            exitGroup();
          }, 100);
        }
      }
      return;
    }

    // 字符串类型字段
    cfg[key] = String(raw);

    // 如果是输入源字段，检查是否有效并自动返回
    if (f.group === 'input' && state.currentGroup === 'input') {
      checkInputSource();
      if (state.inputSourceSet) {
        autoExtractFilename();
        // 延迟一帧后返回分组菜单，让用户看到成功提示
        setTimeout(() => {
          exitGroup();
        }, 100);
      }
    }
  }

  function restoreFromHistory() {
    if (state.selected === 0 || history.length === 0) {
      // 新建下载
      state.view = 'groups';
      state.selected = 0;
      checkInputSource();
      if (!state.inputSourceSet) {
        state.view = 'fields';
        state.currentGroup = 'input';
        state.selected = 0;
      }
      render();
      return;
    }

    const h = history[state.selected - 1];
    if (!h) return;

    // 如果已完成，询问是否重新下载
    if (h.status === 'completed') {
      state.mode = 'confirm';
      state.confirmAction = () => {
        loadConfigFromHistory(h);
        state.mode = 'list';
      };
      state.confirmCancel = () => {
        state.mode = 'list';
        render();
      };
      render();
      return;
    }

    // 未完成或失败的，直接恢复
    loadConfigFromHistory(h);
  }

  function loadConfigFromHistory(h) {
    Object.assign(cfg, h.config);
    state.currentHistoryId = h.id;
    checkInputSource();
    state.view = 'groups';
    state.selected = 0;
    setMessage(`已恢复下载: ${h.filename}`, 'success');
    render();
  }

  function deleteHistoryEntry() {
    if (state.selected === 0 || history.length === 0) return;
    const idx = state.selected - 1;
    if (idx >= 0 && idx < history.length) {
      history.splice(idx, 1);
      saveHistory();
      if (state.selected > history.length) {
        state.selected = history.length;
      }
      setMessage('已删除历史记录', 'info');
      render();
    }
  }

  function beginEditSelected() {
    if (state.view === 'history') {
      // 在历史记录视图中，Enter 恢复下载
      restoreFromHistory();
    } else if (state.view === 'groups') {
      // 在分组视图中，Enter 进入分组
      enterGroup();
    } else {
      // 在字段视图中，Enter 编辑字段
      const groupFields = fields.filter(f => f.group === state.currentGroup);
      const f = groupFields[state.selected];
      if (!f) return;
      if (f.type === 'action' && f.key === '__run__') {
        runAria2c();
        return;
      }
      if (f.type === 'bool') {
        toggleField(f);
        return;
      }
      if (f.type === 'enum') {
        bumpEnum(f);
        return;
      }
      const current = f.type === 'list' ? (Array.isArray(cfg[f.key]) ? cfg[f.key].join(' ') : '') : formatValue(cfg[f.key]);
      beginPrompt(f.key, f.label, f.hint, current);
    }
  }

  function enterGroup() {
    if (state.selected < 0 || state.selected >= groupDefinitions.length) return;
    const group = groupDefinitions[state.selected];

    // 检查是否需要先设置输入源
    if (group.key !== 'input' && !state.inputSourceSet) {
      setMessage('请先设置输入源（下载链接、种子文件或输入文件）', 'warning');
      render();
      return;
    }

    state.view = 'fields';
    state.currentGroup = group.key;
    state.selected = 0;
    render();
  }

  function exitGroup() {
    const wasInInputGroup = state.currentGroup === 'input';

    // 检查输入源设置
    const wasSet = state.inputSourceSet;
    checkInputSource();

    // 如果刚从输入源分组退出，自动尝试从 URL 提取文件名
    if (wasInInputGroup && state.inputSourceSet && !cfg.out) {
      autoExtractFilename();
    }

    // 如果是从输入源返回且刚刚设置成功，显示提示
    if (wasInInputGroup && !wasSet && state.inputSourceSet) {
      setMessage('✓ 输入源已设置，其他分组已解锁', 'success');
    }

    state.view = 'groups';
    state.currentGroup = null;
    state.selected = 0;
    render();
  }

  function autoExtractFilename() {
    if (Array.isArray(cfg.uris) && cfg.uris.length > 0) {
      const firstUri = cfg.uris[0];
      try {
        const url = new URL(firstUri);
        const pathname = url.pathname;
        const filename = pathname.split('/').pop();
        if (filename && filename.length > 0 && filename.includes('.')) {
          cfg.out = decodeURIComponent(filename);
          setMessage(`已自动提取文件名: ${cfg.out}`, 'info');
        }
      } catch {
        // URL 解析失败，忽略
      }
    }
  }

  function onKey(buf) {
    const s = buf.toString('utf8');

    if (s === '\u0003') {
      cleanupTty();
      safeWrite('\n');
      process.exit(0);
    }

    if (state.mode === 'confirm') {
      if (s === 'y' || s === 'Y') {
        if (state.confirmAction) state.confirmAction();
        return;
      }
      if (s === 'n' || s === 'N' || s === '\x1b') {
        if (state.confirmCancel) state.confirmCancel();
        return;
      }
      return;
    }

    if (state.mode === 'prompt') {
      if (s === '\x1b') {
        state.mode = 'list';
        render();
        return;
      }
      if (s === '\r' || s === '\n') {
        applyPromptValue();
        state.mode = 'list';
        render();
        return;
      }
      if (s === '\x7f') {
        state.prompt.value = state.prompt.value.slice(0, -1);
        validatePromptValue();
        render();
        return;
      }
      if (s >= ' ' && s <= '~') {
        state.prompt.value += s;
        validatePromptValue();
        render();
      }
      return;
    }

    if (state.mode === 'preview') {
      if (s === '\x1b') {
        state.mode = 'list';
        render();
        return;
      }
      if (s === 'q') {
        cleanupTty();
        safeWrite('\n');
        process.exit(0);
      }
      if (s === '\r' || s === '\n' || s === 'r') {
        runAria2c();
      }
      return;
    }

    // list mode
    if (s === 'q') {
      cleanupTty();
      safeWrite('\n');
      process.exit(0);
    }

    if (s === '\x1b[A' || s === 'k') {
      // 上键
      if (state.view === 'history') {
        state.selected = Math.max(0, state.selected - 1);
      } else if (state.view === 'groups') {
        state.selected = Math.max(0, state.selected - 1);
      } else {
        const groupFields = fields.filter(f => f.group === state.currentGroup);
        state.selected = Math.max(0, state.selected - 1);
      }
      render();
      return;
    }

    if (s === '\x1b[B' || s === 'j') {
      // 下键
      if (state.view === 'history') {
        const maxIdx = history.length; // +1 for "new download" option
        state.selected = Math.min(maxIdx, state.selected + 1);
      } else if (state.view === 'groups') {
        state.selected = Math.min(groupDefinitions.length - 1, state.selected + 1);
      } else {
        const groupFields = fields.filter(f => f.group === state.currentGroup);
        state.selected = Math.min(groupFields.length - 1, state.selected + 1);
      }
      render();
      return;
    }

    if (s === '\x1b') {
      // Esc 键：返回上一层
      if (state.view === 'fields') {
        exitGroup();
      } else if (state.view === 'groups') {
        state.view = 'history';
        state.selected = 0;
        render();
      }
      return;
    }

    // 历史记录视图特有的键
    if (state.view === 'history') {
      if (s === 'n' || s === 'N') {
        // 新建下载
        state.view = 'groups';
        state.selected = 0;
        checkInputSource();
        if (!state.inputSourceSet) {
          state.view = 'fields';
          state.currentGroup = 'input';
          state.selected = 0;
        }
        render();
        return;
      }
      if (s === 'd' || s === 'D') {
        // 删除历史记录
        deleteHistoryEntry();
        return;
      }
    }

    if (s === ' ') {
      if (state.view === 'fields') {
        const groupFields = fields.filter(f => f.group === state.currentGroup);
        const f = groupFields[state.selected];
        if (f && f.type === 'bool') {
          toggleField(f);
          render();
        }
      }
      return;
    }

    if (s === 'u') {
      // 快捷键：直接进入输入源设置 URIs
      if (state.view === 'groups') {
        state.view = 'fields';
        state.currentGroup = 'input';
        state.selected = 0;
        render();
      } else if (state.currentGroup === 'input') {
        beginPrompt('uris', 'URIs', 'space-separated', Array.isArray(cfg.uris) ? cfg.uris.join(' ') : '');
      }
      return;
    }

    if (s === 't') {
      // 快捷键：直接进入种子文件设置
      if (state.view === 'groups') {
        state.view = 'fields';
        state.currentGroup = 'input';
        state.selected = 1;
        render();
      } else if (state.currentGroup === 'input') {
        beginPrompt('torrentFile', 'Torrent file path', '', cfg.torrentFile || '');
      }
      return;
    }

    if (s === 'p') {
      state.mode = 'preview';
      render();
      return;
    }

    if (s === 's') {
      try {
        saveConfig();
      } catch (e) {
        setMessage(`保存失败: ${String(e && e.message ? e.message : e)}`, 'error');
      }
      render();
      return;
    }

    if (s === 'r') {
      runAria2c();
      return;
    }

    if (s === '\r' || s === '\n') {
      beginEditSelected();
      render();
    }
  }

  process.stdin.setEncoding('utf8');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', (d) => onKey(Buffer.from(d)));

  process.on('SIGWINCH', () => render());
  process.on('SIGINT', () => {
    cleanupTty();
    safeWrite('\n');
    process.exit(0);
  });

  // 初始化：检查输入源状态
  checkInputSource();

  // 默认显示历史记录视图
  state.view = 'history';
  state.selected = 0;

  render();
}

main().catch((e) => {
  try {
    safeWrite(ANSI.showCursor + ANSI.reset + '\n');
  } catch {}
  // eslint-disable-next-line no-console
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
