import { readJson, writeJson } from './config.js';

/**
 * 历史记录管理
 */

export class History {
  constructor(historyPath) {
    this.historyPath = historyPath;
    this.items = [];
    this.load();
  }

  load() {
    const data = readJson(this.historyPath);
    if (Array.isArray(data)) {
      this.items = data.slice(0, 20);
    }
  }

  save() {
    try {
      writeJson(this.historyPath, this.items);
    } catch (e) {
      // 忽略保存失败
    }
  }

  add(config, status = 'pending') {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toISOString(),
      config: { ...config },
      status,
      filename: config.out || 'unknown',
      url: Array.isArray(config.uris) && config.uris.length > 0
        ? config.uris[0]
        : config.inputFile || '',
    };

    // 移除相同 URL 的旧记录
    this.items = this.items.filter(h => h.url !== entry.url);
    this.items.unshift(entry);
    this.items = this.items.slice(0, 20);
    this.save();

    return entry.id;
  }

  updateStatus(id, status) {
    const entry = this.items.find(h => h.id === id);
    if (entry) {
      entry.status = status;
      this.save();
    }
  }

  delete(index) {
    if (index >= 0 && index < this.items.length) {
      this.items.splice(index, 1);
      this.save();
      return true;
    }
    return false;
  }

  get(index) {
    return this.items[index] || null;
  }

  get length() {
    return this.items.length;
  }
}
