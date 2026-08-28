const SIGNATURES = {
  'image/jpeg': buffer => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  'image/png': buffer => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': buffer => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
};

export function decodeImageDataUrl(value, { maxBytes = 3 * 1024 * 1024 } = {}) {
  const input = String(value || '');
  const match = input.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length % 4 !== 0) {
    throw new Error('Допустимы только изображения JPEG, PNG или WebP');
  }

  const mimeType = match[1].toLowerCase();
  const estimatedBytes = Math.floor(match[2].length * 3 / 4);
  if (estimatedBytes > maxBytes + 2) throw new Error('Изображение слишком большое');

  const buffer = Buffer.from(match[2], 'base64');
  validateImageBuffer(buffer, mimeType, { maxBytes });
  return { buffer, mimeType };
}

export function validateImageBuffer(buffer, mimeType, { maxBytes = 3 * 1024 * 1024 } = {}) {
  const normalizedType = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maxBytes) {
    throw new Error('Изображение слишком большое');
  }
  if (!SIGNATURES[normalizedType]?.(buffer)) {
    throw new Error('Содержимое файла не соответствует формату изображения');
  }
  return { buffer, mimeType: normalizedType };
}

export function streamImageDataUrl(res, value, options) {
  try {
    const { buffer, mimeType } = decodeImageDataUrl(value, options);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, no-cache, max-age=0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
    return true;
  } catch (_) {
    return false;
  }
}
