export const formatDuration = (s: number) => {
  if (!isFinite(s) || s < 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
};

export const formatSize = (b: number) => {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = b;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i ? 1 : 0)} ${units[i]}`;
};

export const formatRelative = (ts: number) => {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  const tiers: Array<[number, number, string]> = [
    [60, 1, 'second'],
    [3600, 60, 'minute'],
    [86400, 3600, 'hour'],
    [86400 * 7, 86400, 'day'],
    [86400 * 30, 86400 * 7, 'week'],
    [86400 * 365, 86400 * 30, 'month'],
    [Infinity, 86400 * 365, 'year'],
  ];
  for (const [limit, divisor, label] of tiers) {
    if (s < limit) {
      const n = Math.max(1, Math.floor(s / divisor));
      return `${n} ${label}${n === 1 ? '' : 's'} ago`;
    }
  }
  return 'a while ago';
};
