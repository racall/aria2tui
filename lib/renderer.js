import fs from 'node:fs';
import { ANSI, stripAnsi } from './ansi.js';
import { trunc, drawSeparator, drawGroupHeader, drawBox, getTerminalSize, padRight } from './ui.js';
import { fields, groupDefinitions, getGroupSummary } from './fields.js';
import { formatValue, buildArgsFromConfig, shellEscape } from './utils.js';

/**
 * 渲染函数模块
 */

export function renderHistoryView(state, history) {
  const { cols, rows } = getTerminalSize();
  const now = Date.now();
  const msg = state.message && now - state.messageAt < 4000 ? state.message : '';

  const header = ANSI.bold + ANSI.primaryAccent + 'ARIA2TUI - 下载历史' + ANSI.reset;
  const helpBar = '  ' + ANSI.secondaryText + '↑↓' + ANSI.reset + ' 选择  ' +
                  ANSI.terminalGreen + 'Enter' + ANSI.reset + ' 恢复  ' +
                  ANSI.terminalGreen + 'n' + ANSI.reset + ' 新建  ' +
                  ANSI.terminalGreen + 'd' + ANSI.reset + ' 删除  ' +
                  ANSI.secondaryText + 'q' + ANSI.reset + ' 退出';

  const lines = [];
  lines.push(header);
  lines.push(helpBar);
  lines.push(drawSeparator(cols, '─', 'dim'));

  if (history.length === 0) {
    lines.push('');
    lines.push(ANSI.secondaryText + '  暂无下载历史' + ANSI.reset);
    lines.push('');
    lines.push(ANSI.primaryAccent + '  ⚡ 按 ' + ANSI.bold + 'n' + ANSI.reset + ANSI.primaryAccent + ' 开始新的下载' + ANSI.reset);
  } else {
    lines.push('');

    const newDownloadText = ANSI.terminalGreen + '⚡ 新建下载' + ANSI.reset;
    if (state.selected === 0) {
      lines.push(ANSI.primaryAccent + ' ▸ ' + ANSI.bold + newDownloadText + ANSI.reset);
    } else {
      lines.push('   ' + newDownloadText);
    }

    lines.push('');

    for (let i = 0; i < Math.min(history.length, 15); i++) {
      const h = history.items[i];
      const date = new Date(h.timestamp);
      const timeStr = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

      let statusIcon = '';
      let statusColor = '';
      if (h.status === 'completed') {
        statusIcon = '✓';
        statusColor = ANSI.successGreen;
      } else if (h.status === 'failed') {
        statusIcon = '✗';
        statusColor = ANSI.errorRed;
      } else {
        statusIcon = '⋯';
        statusColor = ANSI.warningYellow;
      }

      const filename = trunc(h.filename || 'unknown', 40);
      const url = trunc(h.url, Math.max(30, cols - 70));

      if (state.selected === i + 1) {
        lines.push(ANSI.primaryAccent + ' ▸ ' + ANSI.reset + statusColor + statusIcon + ANSI.reset + ' ' + ANSI.bold + filename + ANSI.reset + ' ' + ANSI.secondaryText + timeStr + ANSI.reset);
        lines.push('     ' + ANSI.secondaryText + url + ANSI.reset);
      } else {
        const content = `   ${statusColor}${statusIcon}${ANSI.reset} ${filename} ${ANSI.secondaryText}${timeStr}${ANSI.reset}`;
        lines.push(content);
      }
    }
  }

  lines.push('');
  lines.push(drawSeparator(cols, '─', 'dim'));

  if (state.selected === 0) {
    lines.push(ANSI.secondaryText + '  创建新的下载任务' + ANSI.reset);
  } else if (state.selected > 0 && state.selected <= history.length) {
    const h = history.items[state.selected - 1];
    if (h.status === 'completed') {
      lines.push(ANSI.warningYellow + '  ⚠ 此文件已下载完成，按 Enter 重新下载' + ANSI.reset);
    } else if (h.status === 'failed') {
      lines.push(ANSI.primaryAccent + '  可以尝试重新下载此文件' + ANSI.reset);
    } else {
      lines.push(ANSI.primaryAccent + '  继续未完成的下载' + ANSI.reset);
    }
  }

  if (msg) {
    lines.push('');
    const msgColor = state.messageType === 'error' ? ANSI.errorRed :
                    state.messageType === 'success' ? ANSI.successGreen :
                    ANSI.primaryAccent;
    lines.push(msgColor + '  ℹ ' + msg + ANSI.reset);
  }

  return lines.join('\n');
}

export function renderGroupsView(state, cfg) {
  const { cols, rows } = getTerminalSize();
  const now = Date.now();
  const msg = state.message && now - state.messageAt < 4000 ? state.message : '';

  const header = ANSI.bold + ANSI.primaryAccent + 'ARIA2TUI - 配置向导' + ANSI.reset;
  const helpBar = '  ' + ANSI.secondaryText + '↑↓' + ANSI.reset + ' 选择  ' +
                  ANSI.terminalGreen + 'Enter' + ANSI.reset + ' 进入  ' +
                  ANSI.terminalGreen + 'u' + ANSI.reset + ' URI  ' +
                  ANSI.terminalGreen + 't' + ANSI.reset + ' Torrent  ' +
                  ANSI.terminalGreen + 'p' + ANSI.reset + ' 预览  ' +
                  ANSI.terminalGreen + 'r' + ANSI.reset + ' 运行  ' +
                  ANSI.secondaryText + 's' + ANSI.reset + ' 保存  ' +
                  ANSI.secondaryText + 'q' + ANSI.reset + ' 退出';

  const lines = [];
  lines.push(header);
  lines.push(helpBar);
  lines.push(drawSeparator(cols, '─', 'dim'));
  lines.push('');

  for (let i = 0; i < groupDefinitions.length; i++) {
    const group = groupDefinitions[i];
    const isLocked = group.key !== 'input' && !state.inputSourceSet;
    const isSelected = i === state.selected;

    let statusIcon = '';
    let statusColor = '';
    if (group.key === 'input') {
      statusIcon = state.inputSourceSet ? '✓' : '!';
      statusColor = state.inputSourceSet ? ANSI.successGreen : ANSI.warningYellow;
    } else if (group.key === 'action') {
      statusIcon = '▶';
      statusColor = state.inputSourceSet ? ANSI.terminalGreen : ANSI.secondaryText;
    } else {
      if (isLocked) {
        statusIcon = '🔒';
        statusColor = ANSI.secondaryText;
      } else {
        statusIcon = '▸';
        statusColor = ANSI.primaryAccent;
      }
    }

    const summary = group.key !== 'action' ? ` ${ANSI.secondaryText}[${getGroupSummary(cfg, group.key)}]${ANSI.reset}` : '';
    const lockHint = isLocked ? ANSI.secondaryText + ' (需先设置输入源)' + ANSI.reset : '';

    if (isSelected) {
      const content = ` ▸ ${statusColor}${statusIcon}${ANSI.reset} ${group.icon} ${ANSI.bold}${group.name}${ANSI.reset}${summary}${lockHint}`;
      lines.push(ANSI.primaryAccent + content.slice(0, 3) + ANSI.reset + content.slice(3));
    } else {
      const content = `   ${statusColor}${statusIcon}${ANSI.reset} ${group.icon} ${group.name}${summary}${lockHint}`;
      lines.push(content);
    }
  }

  lines.push('');
  lines.push(drawSeparator(cols, '─', 'dim'));

  if (state.selected >= 0 && state.selected < groupDefinitions.length) {
    const group = groupDefinitions[state.selected];
    const isLocked = group.key !== 'input' && !state.inputSourceSet;

    if (isLocked) {
      lines.push(ANSI.warningYellow + '  ⚠ 请先设置输入源（下载链接/种子文件）' + ANSI.reset);
    } else {
      lines.push(ANSI.primaryAccent + '  ℹ ' + group.description + ANSI.reset);
    }
  }

  if (msg) {
    lines.push('');
    const msgColor = state.messageType === 'error' ? ANSI.errorRed :
                    state.messageType === 'success' ? ANSI.successGreen :
                    ANSI.primaryAccent;
    lines.push(msgColor + '  ℹ ' + msg + ANSI.reset);
  }

  return lines.join('\n');
}

export function renderFieldsView(state, cfg) {
  const { cols, rows } = getTerminalSize();
  const now = Date.now();
  const msg = state.message && now - state.messageAt < 4000 ? state.message : '';

  const currentGroupDef = groupDefinitions.find(g => g.key === state.currentGroup);
  const groupName = currentGroupDef ? currentGroupDef.name : '未知分组';
  const groupIcon = currentGroupDef ? currentGroupDef.icon : '';

  const header = drawGroupHeader(`${groupIcon} ${groupName}`, cols, 'section');
  const helpBar = '  ' + ANSI.secondaryText + '↑↓' + ANSI.reset + ' 选择  ' +
                  ANSI.terminalGreen + 'Enter' + ANSI.reset + ' 编辑  ' +
                  ANSI.terminalGreen + 'Space' + ANSI.reset + ' 开关  ' +
                  ANSI.secondaryText + 'Esc' + ANSI.reset + ' 返回  ' +
                  ANSI.secondaryText + 's' + ANSI.reset + ' 保存  ' +
                  ANSI.secondaryText + 'q' + ANSI.reset + ' 退出';

  const lines = [];
  lines.push(header);
  lines.push(helpBar);
  lines.push(drawSeparator(cols, '─', 'dim'));
  lines.push('');

  const groupFields = fields.filter(f => f.group === state.currentGroup);

  for (let i = 0; i < groupFields.length; i++) {
    const f = groupFields[i];
    const isSelected = i === state.selected;

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

    let icon = '';
    let iconColor = '';
    if (f.type === 'bool') {
      icon = cfg[f.key] ? '✓' : '✗';
      iconColor = cfg[f.key] ? ANSI.successGreen : ANSI.errorRed;
    } else if (f.type === 'action') {
      icon = '▶';
      iconColor = ANSI.terminalGreen;
    } else if (f.type === 'list') {
      icon = '≡';
      iconColor = ANSI.primaryAccent;
    } else if (f.type === 'number') {
      icon = '#';
      iconColor = ANSI.primaryAccent;
    } else if (f.type === 'enum') {
      icon = '⚙';
      iconColor = ANSI.primaryAccent;
    } else if (f.type === 'file') {
      icon = '📁';
      iconColor = ANSI.primaryAccent;
    } else {
      icon = '▸';
      iconColor = ANSI.secondaryText;
    }

    let coloredValue = value;
    if (value) {
      if (f.type === 'number') {
        coloredValue = ANSI.primaryAccent + value + ANSI.reset;
      } else if (f.type === 'enum') {
        coloredValue = ANSI.terminalGreen + value + ANSI.reset;
      } else if (f.type === 'bool') {
        coloredValue = '';
      } else if (f.type !== 'action') {
        coloredValue = ANSI.brightWhite + value + ANSI.reset;
      }
    } else {
      coloredValue = ANSI.secondaryText + '(空)' + ANSI.reset;
    }

    if (isSelected) {
      const labelPart = `${iconColor}${icon}${ANSI.reset} ${ANSI.bold}${f.label}${ANSI.reset}`;

      if (f.key === 'uris') {
        const shortcutHint = ANSI.secondaryText + ' (u)' + ANSI.reset;
        lines.push(ANSI.primaryAccent + ' ▸ ' + ANSI.reset + labelPart + shortcutHint);
      } else if (f.key === 'inputFile') {
        const shortcutHint = ANSI.secondaryText + ' (t)' + ANSI.reset;
        const valuePart = f.type !== 'bool' ? ` ${ANSI.secondaryText}:${ANSI.reset} ${coloredValue}` : '';
        lines.push(ANSI.primaryAccent + ' ▸ ' + ANSI.reset + labelPart + shortcutHint + valuePart);
      } else {
        const valuePart = f.type !== 'bool' ? ` ${ANSI.secondaryText}:${ANSI.reset} ${coloredValue}` : '';
        lines.push(ANSI.primaryAccent + ' ▸ ' + ANSI.reset + labelPart + valuePart);
      }

      if (f.key === 'uris' && state.inlineEdit === 'uris') {
        const rawValue = state.inlineEditValue || '';
        const boxWidth = Math.min(cols - 6, 76);
        const innerWidth = Math.max(1, boxWidth - 4);

        // 让“光标”固定显示在文本框内，而不是跑到屏幕底部
        const cursor = ANSI.inverse + ' ' + ANSI.reset;
        let visible = rawValue;
        if (stripAnsi(visible).length > innerWidth - 1) {
          const tailLen = Math.max(0, innerWidth - 2);
          visible = '…' + stripAnsi(visible).slice(-tailLen);
        }

        const content = ANSI.brightWhite + visible + ANSI.reset + cursor;
        const padded = padRight(content, innerWidth);
        const top = '   ' + ANSI.secondaryText + '┌' + '─'.repeat(Math.max(0, boxWidth - 2)) + '┐' + ANSI.reset;
        const middle = '   ' + drawBox([padded], boxWidth)[0];
        const bottom = '   ' + ANSI.secondaryText + '└' + '─'.repeat(Math.max(0, boxWidth - 2)) + '┘' + ANSI.reset;
        const hint =
          '   ' +
          ANSI.secondaryText +
          'Enter' +
          ANSI.reset +
          ' 确认  ' +
          ANSI.secondaryText +
          'Esc' +
          ANSI.reset +
          ' 取消';

        lines.push(top);
        lines.push(middle);
        lines.push(bottom);
        lines.push(hint);
      } else if (f.key === 'uris') {
        if (Array.isArray(cfg.uris) && cfg.uris.length > 0) {
          for (const uri of cfg.uris) {
            lines.push('     ' + ANSI.secondaryText + '• ' + ANSI.reset + trunc(uri, cols - 7));
          }
        } else {
          lines.push('     ' + ANSI.secondaryText + '(按 u 或 Enter 设置下载链接)' + ANSI.reset);
        }
      }
    } else {
      const labelPart = `${iconColor}${icon}${ANSI.reset} ${f.label}`;
      const valuePart = f.type !== 'bool' ? ` ${ANSI.secondaryText}:${ANSI.reset} ${coloredValue}` : '';
      lines.push(`   ${labelPart}${valuePart}`);
    }
  }

  lines.push('');
  lines.push(drawSeparator(cols, '─', 'dim'));

  if (state.inlineEdit === 'uris') {
    lines.push(ANSI.primaryAccent + '  ℹ 输入下载链接，多个链接用空格分隔' + ANSI.reset);
  } else if (state.selected >= 0 && state.selected < groupFields.length) {
    const f = groupFields[state.selected];
    if (f.description) {
      lines.push(ANSI.primaryAccent + '  ℹ ' + f.description + ANSI.reset);
    }
  } else {
    lines.push(ANSI.secondaryText + '  按 Esc 返回分组列表  按 s 保存配置' + ANSI.reset);
  }

  if (msg) {
    lines.push('');
    const msgColor = state.messageType === 'error' ? ANSI.errorRed :
                    state.messageType === 'success' ? ANSI.successGreen :
                    ANSI.primaryAccent;
    lines.push(msgColor + '  ℹ ' + msg + ANSI.reset);
  }

  return lines.join('\n');
}

export function renderPrompt(state) {
  const { cols, rows } = getTerminalSize();
  const label = state.prompt.label || 'Input';
  const hint = state.prompt.hint ? ` ${ANSI.secondaryText}(${state.prompt.hint})${ANSI.reset}` : '';

  const header = drawGroupHeader('编辑输入', cols, 'section');
  const helpBar = '  ' + ANSI.terminalGreen + 'Enter' + ANSI.reset + ' 确认  ' +
                  ANSI.secondaryText + 'Esc' + ANSI.reset + ' 取消  ' +
                  ANSI.secondaryText + 'Backspace' + ANSI.reset + ' 删除';

  const lines = [];
  lines.push(header);
  lines.push(helpBar);
  lines.push(drawSeparator(cols, '─', 'dim'));
  lines.push('');

  lines.push(ANSI.primaryAccent + '  ' + label + hint + ANSI.reset);
  lines.push('');
  const inputBox = [state.prompt.value || ANSI.secondaryText + '(空)' + ANSI.reset];
  lines.push(...drawBox(inputBox, Math.min(cols - 4, 76)));

  const validation = state.prompt.validation;
  if (validation && validation.message) {
    lines.push('');
    let icon = '';
    let color = '';
    if (!validation.valid) {
      icon = '✗';
      color = ANSI.errorRed;
    } else if (validation.warning) {
      icon = '⚠';
      color = ANSI.warningYellow;
    } else {
      icon = '✓';
      color = ANSI.successGreen;
    }
    lines.push(color + `  ${icon} ` + validation.message + ANSI.reset);
  }

  return lines.join('\n');
}

export function renderPreview(cfg, aria2Bin) {
  const { cols, rows } = getTerminalSize();
  const cmdArgs = buildArgsFromConfig(cfg);
  const lines = [];

  const title = '命令预览';
  lines.push(drawGroupHeader(title, cols));
  lines.push(trunc(ANSI.dim + 'Enter/r 执行  Esc 返回  q 退出' + ANSI.reset, cols));
  lines.push('');

  const parts = [aria2Bin, ...cmdArgs];
  let cur = ANSI.brightYellow + parts[0] + ANSI.reset;
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i];
    let coloredPart;
    if (part.startsWith('-')) {
      coloredPart = ANSI.cyan + shellEscape(part) + ANSI.reset;
    } else {
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
  return lines.slice(0, rows).join('\n');
}

export function renderConfirm() {
  const { cols, rows } = getTerminalSize();

  const header = drawGroupHeader('确认操作', cols, 'section');
  const lines = [];
  lines.push(header);
  lines.push('');

  const warningLines = [
    ANSI.warningYellow + '⚠ 此文件已下载完成' + ANSI.reset,
    '',
    '确定要重新下载吗？'
  ];
  lines.push(...drawBox(warningLines, Math.min(cols - 4, 60)));

  lines.push('');
  lines.push(drawSeparator(cols, '─', 'dim'));
  lines.push('');

  lines.push(ANSI.successGreen + '  [y] ' + ANSI.bold + '是' + ANSI.reset + ANSI.successGreen + ' - 重新下载' + ANSI.reset);
  lines.push(ANSI.errorRed + '  [n] ' + ANSI.bold + '否' + ANSI.reset + ANSI.errorRed + ' - 取消操作' + ANSI.reset);

  return lines.join('\n');
}
