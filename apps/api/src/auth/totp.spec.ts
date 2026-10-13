import { totp, verifyTotp } from './totp';

describe('TOTP', () => {
  const secret = 'JBSWY3DPEHPK3PXP';
  it('creates a stable RFC-compatible six digit code for a 30-second window', () => {
    expect(totp(secret, 0)).toBe('282760');
    expect(verifyTotp(secret, '282760', 0)).toBe(true);
  });
  it('allows only the adjacent clock windows', () => {
    const code = totp(secret, 120_000);
    expect(verifyTotp(secret, code, 150_000)).toBe(true);
    expect(verifyTotp(secret, code, 180_001)).toBe(false);
  });
});
