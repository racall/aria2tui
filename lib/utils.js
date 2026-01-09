/**
 * 工具函数
 */

export function shellEscape(arg) {
  if (arg === '') return "''";
  return `'${String(arg).replace(/'/g, `'\\\"'\\\"'`)}'`;
}

export function formatValue(v) {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v === null || v === undefined) return '';
  return String(v);
}

export function parseShellWords(input) {
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

export function buildArgsFromConfig(cfg) {
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

  if (cfg.inputFile) args.push('--input-file', cfg.inputFile);

  const extra = parseShellWords(cfg.extraArgs || '');
  args.push(...extra);

  const uris = Array.isArray(cfg.uris) ? cfg.uris.filter(Boolean) : [];
  args.push(...uris);

  return args;
}
