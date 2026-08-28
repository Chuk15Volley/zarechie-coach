import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeImageDataUrl, validateImageBuffer } from '../lib/imageData.js';

test('accepts only allow-listed image MIME types with matching magic bytes', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const decoded = decodeImageDataUrl(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
  assert.equal(decoded.mimeType, 'image/jpeg');
  assert.deepEqual(decoded.buffer, jpeg);

  assert.throws(
    () => decodeImageDataUrl(`data:image/png;base64,${jpeg.toString('base64')}`),
    /не соответствует/,
  );
  assert.throws(
    () => decodeImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='),
    /JPEG, PNG или WebP/,
  );
  assert.throws(
    () => decodeImageDataUrl('data:text/html;base64,PGgxPng8L2gxPg=='),
    /JPEG, PNG или WebP/,
  );
});

test('enforces decoded image size limits', () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(20)]);
  assert.throws(() => validateImageBuffer(jpeg, 'image/jpeg', { maxBytes: 10 }), /слишком большое/);
});
