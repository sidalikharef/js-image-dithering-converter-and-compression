export async function findClosestTargetSize(encode, {
  targetBytes, minQuality = 0.1, maxQuality = 1, attempts = 8, signal
} = {}) {
  if (typeof encode !== 'function') throw new TypeError('An encoder callback is required.');
  if (!Number.isSafeInteger(targetBytes) || targetBytes < 1) throw new RangeError('Target size must be a positive number of bytes.');
  if (!Number.isFinite(minQuality) || !Number.isFinite(maxQuality) ||
      minQuality < 0 || maxQuality > 1 || minQuality >= maxQuality) {
    throw new RangeError('Quality bounds must satisfy 0 ≤ minQuality < maxQuality ≤ 1.');
  }
  if (!Number.isInteger(attempts) || attempts < 2 || attempts > 20) {
    throw new RangeError('Attempts must be an integer from 2 to 20.');
  }

  const cache = new Map();
  const qualities = Array.from({length:attempts},(_,index) =>
    Number((minQuality + (maxQuality - minQuality) * index / (attempts - 1)).toFixed(4)));
  for (const quality of qualities) {
    if (signal?.aborted) throw new DOMException('Target-size search cancelled.', 'AbortError');
    if (!cache.has(quality)) cache.set(quality, await encode(quality));
  }
  const results = [...cache].map(([quality,blob]) => ({quality,blob,bytes:blob.size}));
  results.sort((a,b) => Math.abs(a.bytes-targetBytes) - Math.abs(b.bytes-targetBytes) || b.quality-a.quality);
  const best = results[0];
  return {
    ...best,
    compliant:best.bytes <= targetBytes,
    attempts:results.length,
    tested:results.map(({quality,bytes}) => ({quality,bytes}))
  };
}

export function parseTargetBytes(value, unit = 'KiB') {
  const amount = Number(value);
  const multiplier = unit === 'MiB' ? 1024 * 1024 : unit === 'KiB' ? 1024 : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(multiplier)) {
    throw new RangeError('Enter a positive target size in KiB or MiB.');
  }
  const bytes = Math.round(amount * multiplier);
  if (!Number.isSafeInteger(bytes) || bytes < 1) throw new RangeError('Target size is out of range.');
  return bytes;
}
