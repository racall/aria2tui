#!/usr/bin/env node
import { selectFile } from './lib/filebrowser.js';
import readline from 'node:readline';

console.log('测试文件浏览器 Esc 键行为...\n');

// 模拟主程序的 stdin 设置
process.stdin.setEncoding('utf8');
process.stdin.setRawMode(true);
process.stdin.resume();

let testPhase = 'before';

function onKey(data) {
  const s = data.toString('utf8');

  if (s === '\u0003') {
    console.log('\n\n收到 Ctrl+C，程序退出');
    process.exit(0);
  }

  console.log(`\n[${testPhase}] 收到按键:`, JSON.stringify(s));

  if (testPhase === 'after' && s === 'q') {
    console.log('\n测试完成，程序退出');
    process.stdin.setRawMode(false);
    process.exit(0);
  }
}

process.stdin.on('data', onKey);

console.log('阶段 1: 文件浏览器之前');
console.log('按任意键继续...\n');

// 等待用户按键
process.stdin.once('data', async () => {
  console.log('\n阶段 2: 打开文件浏览器');
  console.log('请在文件浏览器中按 Esc 取消\n');

  testPhase = 'filebrowser';

  // 保存状态
  const wasRawMode = process.stdin.isRaw;
  const wasPaused = process.stdin.isPaused();
  const originalDataListeners = process.stdin.listeners('data');
  const originalEncoding = process.stdin.readableEncoding || 'utf8';

  console.log('保存的状态:', {
    wasRawMode,
    wasPaused,
    dataListeners: originalDataListeners.length,
    encoding: originalEncoding
  });

  // 退出 raw mode
  if (process.stdin.isTTY) process.stdin.setRawMode(false);

  const result = await selectFile('/tmp/aria2tui-test');

  console.log('\n文件浏览器返回:', result || '(已取消)');

  // 恢复状态
  try {
    if (process.stdin.isTTY) {
      console.log('\n恢复终端状态...');

      // 恢复 encoding
      process.stdin.setEncoding(originalEncoding);

      // 恢复 raw mode
      if (wasRawMode) {
        process.stdin.setRawMode(true);
      }

      // 恢复 resume 状态
      if (!wasPaused) {
        process.stdin.resume();
      }

      // 清理 keypress 监听器
      process.stdin.removeAllListeners('keypress');

      // 检查 data 监听器
      const currentDataListeners = process.stdin.listeners('data');
      console.log('当前 data 监听器数量:', currentDataListeners.length);

      if (currentDataListeners.length === 0 && originalDataListeners.length > 0) {
        console.log('重新添加 data 监听器...');
        originalDataListeners.forEach(listener => process.stdin.on('data', listener));
      }

      console.log('\n恢复的状态:', {
        isRawMode: process.stdin.isRaw,
        isPaused: process.stdin.isPaused(),
        dataListeners: process.stdin.listeners('data').length,
        encoding: process.stdin.readableEncoding
      });
    }
  } catch (e) {
    console.error('恢复失败:', e.message);
  }

  testPhase = 'after';

  console.log('\n阶段 3: 文件浏览器之后');
  console.log('请按任意键测试输入是否正常（按 q 退出）\n');
});
