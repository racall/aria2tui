import { ANSI } from './ansi.js';

/**
 * 字段定义和分组配置
 */

export const fields = [
  // 输入源
  { key: 'uris', label: '下载链接 (u)', type: 'list', group: 'input', description: '设置下载 URL，可以设置多个，空格分隔', hint: '空格分隔' },
  { key: 'inputFile', label: '选择文件 (t)', type: 'file', group: 'input', description: '选择种子文件(.torrent)、Metalink文件(.metalink)或输入文件', hint: '文件路径' },

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

export const groupDefinitions = [
  { key: 'input', name: '输入源', icon: '🔗', description: '设置下载 URL、种子文件或输入文件', required: true },
  { key: 'save', name: '保存设置', icon: '💾', description: '设置保存目录、文件名和断点续传' },
  { key: 'performance', name: '性能优化', icon: '⚡', description: '调整并发、分片、连接数等性能参数' },
  { key: 'limit', name: '限速控制', icon: '🚦', description: '限制下载和上传速度' },
  { key: 'torrent', name: '种子设置', icon: '🌱', description: 'BT 下载相关设置' },
  { key: 'advanced', name: '高级选项', icon: '⚙️', description: 'User-Agent、证书校验等高级选项' },
  { key: 'action', name: '执行下载', icon: '▶️', description: '预览和执行 aria2c 命令' },
];

export function getGroupSummary(cfg, groupKey) {
  const groupFields = fields.filter(f => f.group === groupKey);
  const setCount = groupFields.filter(f => {
    const val = cfg[f.key];
    if (f.type === 'list') return Array.isArray(val) && val.length > 0;
    if (f.type === 'bool') return true;
    if (f.type === 'action') return false;
    return val !== '' && val !== null && val !== undefined;
  }).length;
  const totalCount = groupFields.filter(f => f.type !== 'action').length;
  return `${setCount}/${totalCount}`;
}
