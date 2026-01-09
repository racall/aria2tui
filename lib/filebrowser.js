import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 文件浏览器模块（内置实现，不依赖第三方库）
 *
 * 只列出指定目录（默认当前目录）下的文件，不进入子目录。
 */

// aria2 支持的文件类型
export const SUPPORTED_EXTENSIONS = ['.torrent', '.metalink', '.meta4', '.txt'];

/**
 * 列出目录下可选文件（仅当前目录，不递归）
 * @param {string} dirPath - 目录路径（默认当前工作目录）
 * @returns {{name:string, fullPath:string}[]} 文件列表
 */
export function listSupportedFiles(dirPath = process.cwd()) {
  const base = dirPath && String(dirPath).trim() ? dirPath : process.cwd();
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((d) => d && d.isFile())
    .map((d) => d.name)
    .filter((name) => SUPPORTED_EXTENSIONS.includes(path.extname(name).toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, fullPath: path.resolve(base, name) }));
}

/**
 * 兼容旧接口：目前主程序不再直接调用该函数。
 * @deprecated
 */
export async function selectFile(startPath = os.homedir()) {
  const list = listSupportedFiles(startPath);
  return list.length > 0 ? list[0].fullPath : null;
}
