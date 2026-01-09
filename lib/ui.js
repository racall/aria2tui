import { ANSI, stripAnsi } from './ansi.js';

/**
 * UI 工具函数
 */

export function padRight(s, w) {
  const raw = stripAnsi(s);
  if (raw.length >= w) return s;
  return s + ' '.repeat(w - raw.length);
}

export function trunc(s, w) {
  const raw = stripAnsi(s);
  if (raw.length <= w) return s;
  return raw.slice(0, Math.max(0, w - 1)) + '…';
}

export function drawSeparator(width, char = '─', style = 'normal') {
  const line = char.repeat(Math.max(0, width));
  if (style === 'bold') return ANSI.bold + line + ANSI.reset;
  if (style === 'dim') return ANSI.secondaryText + line + ANSI.reset;
  if (style === 'accent') return ANSI.primaryAccent + line + ANSI.reset;
  return line;
}

export function drawGroupHeader(title, width, style = 'default') {
  if (width < 10) return trunc(title, width);

  if (style === 'main') {
    return ANSI.bold + ANSI.primaryAccent + title + ANSI.reset;
  } else if (style === 'section') {
    return ANSI.terminalGreen + '▸ ' + ANSI.bold + title + ANSI.reset;
  } else {
    const leftPad = 1;
    const rightFill = Math.max(0, width - leftPad - stripAnsi(title).length - 1);
    return ANSI.cyan + ANSI.bold + '─' + title + '─'.repeat(rightFill) + ANSI.reset;
  }
}

export function drawBox(lines, width) {
  const boxed = [];
  const innerWidth = width - 4;
  for (const line of lines) {
    const content = trunc(line, innerWidth);
    const padding = ' '.repeat(Math.max(0, innerWidth - stripAnsi(content).length));
    boxed.push(ANSI.secondaryText + '│ ' + ANSI.reset + content + padding + ANSI.secondaryText + ' │' + ANSI.reset);
  }
  return boxed;
}

export function safeWrite(s) {
  process.stdout.write(s);
}

export function getTerminalSize() {
  return { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 };
}
