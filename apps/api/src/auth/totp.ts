import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function createTotpSecret() {
  let bits = 0; let value = 0; let result = '';
  for (const byte of randomBytes(20)) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decodeBase32(secret: string) {
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const char of secret.replace(/[\s-]/g, '').toUpperCase()) {
    const index = alphabet.indexOf(char); if (index < 0) throw new Error('Invalid TOTP secret');
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, at = Date.now()) {
  const counter = Math.floor(at / 30_000); const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', decodeBase32(secret)).update(bytes).digest(); const offset = digest[digest.length - 1] & 15;
  return String(((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)).padStart(6, '0');
}

export function verifyTotp(secret: string, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return false;
  return [-30_000, 0, 30_000].some(offset => {
    if (now + offset < 0) return false;
    const expected = Buffer.from(totp(secret, now + offset)); const supplied = Buffer.from(code);
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
}
