#!/usr/bin/env node
import { selectFile } from './lib/filebrowser.js';

console.log('测试文件浏览器...');
console.log('请尝试选择一个文件或按 Ctrl+C 取消\n');

const result = await selectFile('/tmp/aria2tui-test');
console.log('\n结果:', result || '(已取消)');
process.exit(0);
