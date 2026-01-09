/**
 * ANSI 转义序列和颜色定义
 */

export const ANSI = {
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
  // Terminal Green theme
  terminalGreen: '\x1b[92m',
  primaryAccent: '\x1b[96m',
  secondaryText: '\x1b[90m',
  successGreen: '\x1b[92m',
  warningYellow: '\x1b[93m',
  errorRed: '\x1b[91m',
  // Background combinations
  bgDark: '\x1b[48;5;235m',
  bgHighlight: '\x1b[48;5;238m',
};

/**
 * 移除字符串中的 ANSI 转义序列
 */
export function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');
}
