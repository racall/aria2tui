#!/usr/bin/env node

/**
 * aria2tui - 终端界面快速配置并执行 aria2c 命令
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ANSI } from './lib/ansi.js';
import { safeWrite } from './lib/ui.js';
import { fields, groupDefinitions } from './lib/fields.js';
import { listSupportedFiles, SUPPORTED_EXTENSIONS } from './lib/filebrowser.js';
import { parseArgs, getDefaults, readJson, writeJson } from './lib/config.js';
import { History } from './lib/history.js';
import { buildArgsFromConfig, formatValue } from './lib/utils.js';
import {
  renderHistoryView,
  renderGroupsView,
  renderFieldsView,
  renderPrompt,
  renderPreview,
  renderConfirm
} from './lib/renderer.js';

function usage() {
  return [
    'aria2tui - 终端界面生成并执行 aria2c 命令',
    '',
    'Usage:',
    '  aria2tui [--bin aria2c] [--config /path/to/config.json]',
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

function checkInputSource(cfg) {
  const hasUris = Array.isArray(cfg.uris) && cfg.uris.length > 0;
  const hasInputFile = cfg.inputFile && cfg.inputFile.trim() !== '';
  return hasUris || hasInputFile;
}

function autoExtractFilename(cfg) {
  if (Array.isArray(cfg.uris) && cfg.uris.length > 0) {
    const firstUri = cfg.uris[0];
    try {
      const url = new URL(firstUri);
      const pathname = url.pathname;
      const filename = pathname.split('/').pop();
      if (filename && filename.length > 0 && filename.includes('.')) {
        cfg.out = decodeURIComponent(filename);
        return cfg.out;
      }
    } catch {
      // URL 解析失败，忽略
    }
  }
  return null;
}

function validateFieldValue(field, value) {
  if (!value || value.trim() === '') {
    return { valid: true, message: '' };
  }

  if (field.type === 'number') {
    const v = Number(value);
    if (!Number.isFinite(v)) {
      return { valid: false, message: '必须是有效数字' };
    }
    return { valid: true, message: '✓ 有效数字' };
  }

  if (field.type === 'string' && (field.key === 'dir' || field.key === 'inputFile')) {
    if (fs.existsSync(value)) {
      return { valid: true, message: '✓ 路径存在' };
    } else {
      return { valid: true, message: '⚠ 路径不存在（将在下载时创建或报错）', warning: true };
    }
  }

  if (field.key === 'maxDownloadLimit' || field.key === 'maxUploadLimit') {
    if (/^\d+[KMG]?$/i.test(value)) {
      return { valid: true, message: '✓ 格式正确' };
    } else {
      return { valid: false, message: '格式错误，应为如 10M, 1G, 500K' };
    }
  }

  return { valid: true, message: '' };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error('This tool needs a TTY (run in a real terminal).');
    process.exit(1);
  }

  const defaults = getDefaults();
  const loaded = readJson(args.config);
  const cfg = { ...defaults, ...(loaded && typeof loaded === 'object' ? loaded : {}) };

  const history = new History(args.history);

  const state = {
    mode: 'list',
    view: 'history',
    currentGroup: null,
    selected: 0,
    prompt: { label: '', hint: '', value: '', targetKey: '', validation: { valid: true, message: '' } },
    inlineEdit: null,
    inlineEditValue: '',
    fileBrowser: { targetKey: '', currentPath: '', items: [], selected: 0 },
    message: '',
    messageType: 'info',
    messageAt: 0,
    inputSourceSet: checkInputSource(cfg),
    currentHistoryId: null,
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

  function renderFileBrowserView() {
    const fb = state.fileBrowser;
    const items = Array.isArray(fb.items) ? fb.items : [];
    const header =
      ANSI.primaryAccent +
      '📁 文件浏览器（当前目录）' +
      ANSI.reset +
      '\n' +
      ANSI.secondaryText +
      `  ${fb.currentPath}` +
      ANSI.reset +
      '\n' +
      ANSI.secondaryText +
      '  ↑/↓(j/k) 选择  Enter 确认  Esc 取消' +
      ANSI.reset +
      '\n\n';

    if (items.length === 0) {
      return (
        header +
        ANSI.warningYellow +
        `当前目录没有可选文件（${SUPPORTED_EXTENSIONS.join(' ')})` +
        ANSI.reset +
        '\n'
      );
    }

    const maxRows = Math.max(5, (process.stdout.rows || 24) - 6);
    const start = Math.max(0, Math.min(fb.selected - Math.floor(maxRows / 2), items.length - maxRows));
    const end = Math.min(items.length, start + maxRows);

    let body = '';
    for (let i = start; i < end; i++) {
      const isSelected = i === fb.selected;
      const prefix = isSelected ? ANSI.inverse + '> ' : '  ';
      const suffix = isSelected ? ANSI.reset : '';
      body += prefix + items[i].name + suffix + '\n';
    }
    return header + body;
  }

  function render() {
    let content = '';
    const showCursor = state.mode === 'prompt';

    if (state.mode === 'filebrowser') {
      content = renderFileBrowserView();
    } else if (state.mode === 'confirm') {
      content = renderConfirm();
    } else if (state.mode === 'prompt') {
      content = renderPrompt(state);
    } else if (state.mode === 'preview') {
      content = renderPreview(cfg, args.bin);
    } else if (state.view === 'history') {
      content = renderHistoryView(state, history);
    } else if (state.view === 'groups') {
      state.inputSourceSet = checkInputSource(cfg);
      content = renderGroupsView(state, cfg);
    } else if (state.view === 'fields') {
      content = renderFieldsView(state, cfg);
    }

    safeWrite((showCursor ? ANSI.showCursor : ANSI.hideCursor) + ANSI.clear + ANSI.home);
    safeWrite(content);
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
    if (!cmdArgs.some((x) => typeof x === 'string' && x.length > 0 && !x.startsWith('-')) && !cfg.inputFile) {
      setMessage('未设置输入：按 u 填链接，或按 t 选种子，或设置输入文件', 'warning');
      render();
      return;
    }

    const historyId = state.currentHistoryId || history.add(cfg, 'pending');
    state.currentHistoryId = historyId;

    cleanupTty();
    safeWrite('\n');
    const child = spawn(args.bin, cmdArgs, { stdio: 'inherit' });
    child.on('exit', (code, signal) => {
      if (code === 0) {
        history.updateStatus(historyId, 'completed');
      } else {
        history.updateStatus(historyId, 'failed');
      }
      if (signal) process.exit(128);
      process.exit(code == null ? 1 : code);
    });
    child.on('error', (e) => {
      history.updateStatus(historyId, 'failed');
      console.error(String(e && e.message ? e.message : e));
      process.exit(1);
    });
  }

  function saveConfig() {
    writeJson(args.config, cfg);
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

  function beginPrompt(targetKey, label, hint, initialValue) {
    state.mode = 'prompt';
    const field = fields.find(f => f.key === targetKey);
    state.prompt = {
      targetKey,
      label,
      hint: hint || '',
      value: String(initialValue ?? ''),
      validation: { valid: true, message: '' }
    };
    if (field) {
      state.prompt.validation = validateFieldValue(field, state.prompt.value);
    }
    render();
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
      cfg[key] = String(raw || '').trim().split(/\s+/).filter(Boolean);
      if (f.group === 'input' && state.currentGroup === 'input') {
        state.inputSourceSet = checkInputSource(cfg);
        if (state.inputSourceSet) {
          autoExtractFilename(cfg);
          setTimeout(() => exitGroup(), 100);
        }
      }
      return;
    }

    cfg[key] = String(raw);
    if (f.group === 'input' && state.currentGroup === 'input') {
      state.inputSourceSet = checkInputSource(cfg);
      if (state.inputSourceSet) {
        autoExtractFilename(cfg);
        setTimeout(() => exitGroup(), 100);
      }
    }
  }

  async function beginFileBrowser(targetKey) {
    const cwd = process.cwd();
    state.fileBrowser.targetKey = targetKey;
    state.fileBrowser.currentPath = cwd;
    state.fileBrowser.items = listSupportedFiles(cwd);
    state.fileBrowser.selected = 0;
    state.mode = 'filebrowser';
    render();
  }

  function restoreFromHistory() {
    if (state.selected === 0 || history.length === 0) {
      state.view = 'groups';
      state.selected = 0;
      state.inputSourceSet = checkInputSource(cfg);
      if (!state.inputSourceSet) {
        state.view = 'fields';
        state.currentGroup = 'input';
        state.selected = 0;
      }
      render();
      return;
    }

    const h = history.get(state.selected - 1);
    if (!h) return;

    if (h.status === 'completed') {
      state.mode = 'confirm';
      state.confirmAction = () => {
        Object.assign(cfg, h.config);
        state.currentHistoryId = h.id;
        state.inputSourceSet = checkInputSource(cfg);
        state.view = 'groups';
        state.selected = 0;
        state.mode = 'list';
        setMessage(`已恢复下载: ${h.filename}`, 'success');
        render();
      };
      state.confirmCancel = () => {
        state.mode = 'list';
        render();
      };
      render();
      return;
    }

    Object.assign(cfg, h.config);
    state.currentHistoryId = h.id;
    state.inputSourceSet = checkInputSource(cfg);
    state.view = 'groups';
    state.selected = 0;
    setMessage(`已恢复下载: ${h.filename}`, 'success');
    render();
  }

  function deleteHistoryEntry() {
    if (state.selected === 0 || history.length === 0) return;
    const idx = state.selected - 1;
    if (history.delete(idx)) {
      if (state.selected > history.length) {
        state.selected = history.length;
      }
      setMessage('已删除历史记录', 'info');
      render();
    }
  }

  function enterGroup() {
    if (state.selected < 0 || state.selected >= groupDefinitions.length) return;
    const group = groupDefinitions[state.selected];

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
    const wasSet = state.inputSourceSet;
    state.inputSourceSet = checkInputSource(cfg);

    if (wasInInputGroup && state.inputSourceSet && !cfg.out) {
      const extracted = autoExtractFilename(cfg);
      if (extracted) {
        setMessage(`已自动提取文件名: ${extracted}`, 'info');
      }
    }

    if (wasInInputGroup && !wasSet && state.inputSourceSet) {
      setMessage('✓ 输入源已设置，其他分组已解锁', 'success');
    }

    state.view = 'groups';
    state.currentGroup = null;
    state.selected = 0;
    render();
  }

  function beginEditSelected() {
    if (state.view === 'history') {
      restoreFromHistory();
    } else if (state.view === 'groups') {
      enterGroup();
    } else {
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

      if (f.key === 'uris') {
        const current = Array.isArray(cfg.uris) ? cfg.uris.join(' ') : '';
        state.inlineEdit = 'uris';
        state.inlineEditValue = current;
        render();
        return;
      }

      if (f.type === 'file') {
        beginFileBrowser(f.key);
        return;
      }

      const current = f.type === 'list' ? (Array.isArray(cfg[f.key]) ? cfg[f.key].join(' ') : '') : formatValue(cfg[f.key]);
      beginPrompt(f.key, f.label, f.hint, current);
    }
  }

  function onKey(buf) {
    const s = buf.toString('utf8');

    if (s === '\u0003') {
      cleanupTty();
      safeWrite('\n');
      process.exit(0);
    }

    if (state.mode === 'filebrowser') {
      const items = Array.isArray(state.fileBrowser.items) ? state.fileBrowser.items : [];
      if (s === '\x1b') {
        state.mode = 'list';
        setMessage('已取消选择', 'info');
        render();
        return;
      }
      if (s === '\x1b[A' || s === 'k') {
        state.fileBrowser.selected = Math.max(0, state.fileBrowser.selected - 1);
        render();
        return;
      }
      if (s === '\x1b[B' || s === 'j') {
        state.fileBrowser.selected = Math.min(Math.max(0, items.length - 1), state.fileBrowser.selected + 1);
        render();
        return;
      }
      if (s === 'q') {
        state.mode = 'list';
        setMessage('已取消选择', 'info');
        render();
        return;
      }
      if (s === '\r' || s === '\n') {
        if (items.length === 0) {
          state.mode = 'list';
          setMessage('当前目录没有可选文件', 'warning');
          render();
          return;
        }
        const picked = items[state.fileBrowser.selected];
        if (!picked) return;
        cfg[state.fileBrowser.targetKey] = picked.fullPath;
        state.inputSourceSet = checkInputSource(cfg);
        setMessage(`✓ 已选择文件: ${picked.name}`, 'success');
        state.mode = 'list';
        render();
        if (state.inputSourceSet && state.currentGroup === 'input') {
          setTimeout(() => exitGroup(), 100);
        }
        return;
      }
      return;
    }

    // 处理内联编辑模式
    if (state.inlineEdit === 'uris') {
      if (s === '\x1b') {
        state.inlineEdit = null;
        state.inlineEditValue = '';
        render();
        return;
      }
      if (s === '\r' || s === '\n') {
        const value = state.inlineEditValue.trim();
        if (value) {
          cfg.uris = value.split(/\s+/).filter(u => u.length > 0);
          state.inputSourceSet = checkInputSource(cfg);
          if (state.inputSourceSet) {
            const extracted = autoExtractFilename(cfg);
            if (extracted) {
              setMessage(`✓ 下载链接已设置，文件名: ${extracted}`, 'success');
            } else {
              setMessage('✓ 下载链接已设置', 'success');
            }
          }
        } else {
          cfg.uris = [];
          state.inputSourceSet = checkInputSource(cfg);
        }
        state.inlineEdit = null;
        state.inlineEditValue = '';

        if (state.inputSourceSet && state.currentGroup === 'input') {
          setTimeout(() => exitGroup(), 100);
        }
        render();
        return;
      }
      if (s === '\x7f') {
        state.inlineEditValue = state.inlineEditValue.slice(0, -1);
        render();
        return;
      }
      if (s >= ' ' && s <= '~') {
        state.inlineEditValue += s;
        render();
        return;
      }
      return;
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
        const field = fields.find(f => f.key === state.prompt.targetKey);
        if (field) {
          state.prompt.validation = validateFieldValue(field, state.prompt.value);
        }
        render();
        return;
      }
      if (s >= ' ' && s <= '~') {
        state.prompt.value += s;
        const field = fields.find(f => f.key === state.prompt.targetKey);
        if (field) {
          state.prompt.validation = validateFieldValue(field, state.prompt.value);
        }
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
      if (state.view === 'history') {
        const maxIdx = history.length;
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
      if (state.view === 'fields') {
        exitGroup();
      } else if (state.view === 'groups') {
        state.view = 'history';
        state.selected = 0;
        render();
      }
      return;
    }

    if (state.view === 'history') {
      if (s === 'n' || s === 'N') {
        state.view = 'groups';
        state.selected = 0;
        state.inputSourceSet = checkInputSource(cfg);
        if (!state.inputSourceSet) {
          state.view = 'fields';
          state.currentGroup = 'input';
          state.selected = 0;
        }
        render();
        return;
      }
      if (s === 'd' || s === 'D') {
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
      if (state.view === 'groups') {
        state.view = 'fields';
        state.currentGroup = 'input';
        state.selected = 0;
        const current = Array.isArray(cfg.uris) ? cfg.uris.join(' ') : '';
        state.inlineEdit = 'uris';
        state.inlineEditValue = current;
        render();
      } else if (state.currentGroup === 'input') {
        const current = Array.isArray(cfg.uris) ? cfg.uris.join(' ') : '';
        state.inlineEdit = 'uris';
        state.inlineEditValue = current;
        render();
      }
      return;
    }

    if (s === 't') {
      if (state.view === 'groups') {
        state.view = 'fields';
        state.currentGroup = 'input';
        state.selected = 1;
        render();
      } else if (state.currentGroup === 'input') {
        const groupFields = fields.filter(f => f.group === state.currentGroup);
        const fileField = groupFields.find(f => f.type === 'file');
        if (fileField) {
          beginFileBrowser(fileField.key);
        }
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
  const stdinDataHandler = (d) => onKey(Buffer.from(d));
  process.stdin.on('data', stdinDataHandler);

  process.on('SIGWINCH', () => render());
  process.on('SIGINT', () => {
    cleanupTty();
    safeWrite('\n');
    process.exit(0);
  });

  state.inputSourceSet = checkInputSource(cfg);
  state.view = 'history';
  state.selected = 0;

  render();
}

main().catch((e) => {
  try {
    safeWrite(ANSI.showCursor + ANSI.reset + '\n');
  } catch {}
  console.error(String(e && e.stack ? e.stack : e));
  process.exit(1);
});
