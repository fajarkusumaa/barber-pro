import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, signSessionToken, verifySessionToken } from '@/server/auth/crypto';
import { authenticateAdmin, upsertAdmin } from '@/server/auth/admin-users';
import { createTestDatabase } from './helpers/test-db';
import { Database } from '@/db';

describe('Auth & Crypto Module', () => {
  it('hashes and verifies passwords securely with scrypt', async () => {
    const password = 'mySecurePassword123!';
    const hashed = await hashPassword(password);

    expect(hashed).toMatch(/^scrypt\$/);
    const valid = await verifyPassword(password, hashed);
    expect(valid).toBe(true);

    const invalid = await verifyPassword('wrongPassword', hashed);
    expect(invalid).toBe(false);
  });

  it('signs and verifies session tokens with expiry and signature tampering detection', () => {
    const secret = 'super-secret-key-at-least-32-chars-long';
    const payload = { uid: 42, exp: Date.now() + 60000 };

    const token = signSessionToken(payload, secret);
    expect(typeof token).toBe('string');
    expect(token).toContain('.');

    const verified = verifySessionToken(token, secret);
    expect(verified).not.toBeNull();
    expect(verified?.uid).toBe(42);

    // Tampered token
    const tampered = token.slice(0, -5) + 'xxxxx';
    expect(verifySessionToken(tampered, secret)).toBeNull();

    // Wrong secret
    expect(verifySessionToken(token, 'different-secret')).toBeNull();

    // Expired token
    const expiredPayload = { uid: 42, exp: Date.now() - 1000 };
    const expiredToken = signSessionToken(expiredPayload, secret);
    expect(verifySessionToken(expiredToken, secret)).toBeNull();
  });

  describe('Admin Users Service (Database)', () => {
    let testDb: Database;

    beforeEach(async () => {
      const { db } = await createTestDatabase();
      testDb = db;
    });

    it('creates admin user and authenticates correctly', async () => {
      const user = await upsertAdmin(
        { email: 'admin@test.com', name: 'Super Admin', password: 'password123' },
        testDb
      );
      expect(user.id).toBeDefined();
      expect(user.email).toBe('admin@test.com');

      const authenticated = await authenticateAdmin('admin@test.com', 'password123', testDb);
      expect(authenticated).not.toBeNull();
      expect(authenticated?.id).toBe(user.id);

      const wrongPass = await authenticateAdmin('admin@test.com', 'wrongPass', testDb);
      expect(wrongPass).toBeNull();

      const notFound = await authenticateAdmin('unknown@test.com', 'password123', testDb);
      expect(notFound).toBeNull();
    });
  });
});
