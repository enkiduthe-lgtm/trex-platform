import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { JwtClaims } from './auth.types';
import { Role } from './roles';
import { MfaService } from './mfa.service';

interface UserRow { id: string; email: string; password_hash: string; role: Role; is_active: boolean; mfa_secret_ciphertext: string | null; mfa_enabled_at: Date | null; }
interface SessionRow { id: string; user_id: string; email: string; role: Role; }

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService, private readonly jwt: JwtService, private readonly mfa: MfaService) {}
  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private async accessToken(user: Pick<UserRow, 'id' | 'email' | 'role'>, sessionId: string) {
    return this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, sid: sessionId } satisfies JwtClaims);
  }
  private expiry() { const days = Number(process.env.SESSION_TTL_DAYS ?? 30); return new Date(Date.now() + days * 86_400_000); }
  async login(email: string, password: string, metadata: { ip?: string; userAgent?: string }, mfaCode?: string) {
    const result = await this.db.query<UserRow>('SELECT id, email, password_hash, role, is_active, mfa_secret_ciphertext, mfa_enabled_at FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = result.rows[0];
    if (!user || !user.is_active || !(await argon2.verify(user.password_hash, password))) throw new UnauthorizedException('Invalid credentials');
    this.mfa.verifyLogin(user, mfaCode);
    return this.createSession(user, metadata);
  }
  private async createSession(user: Pick<UserRow, 'id' | 'email' | 'role'>, metadata: { ip?: string; userAgent?: string }) {
    const refreshToken = randomBytes(48).toString('base64url'); const expiresAt = this.expiry();
    const session = await this.db.query<{ id: string }>('INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1, $2, $3, $4, $5) RETURNING id', [user.id, this.hashToken(refreshToken), expiresAt, metadata.ip ?? null, metadata.userAgent ?? null]);
    return { accessToken: await this.accessToken(user, session.rows[0].id), refreshToken, expiresAt };
  }
  async rotate(refreshToken: string, metadata: { ip?: string; userAgent?: string }) {
    const hash = this.hashToken(refreshToken);
    return this.db.transaction(async (client: PoolClient) => {
      const result = await client.query<SessionRow>('SELECT s.id, s.user_id, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active FOR UPDATE', [hash]);
      const session = result.rows[0]; if (!session) throw new UnauthorizedException('Session is invalid or expired');
      await client.query('UPDATE sessions SET revoked_at=now() WHERE id=$1', [session.id]);
      const newToken = randomBytes(48).toString('base64url'); const expiresAt = this.expiry();
      const inserted = await client.query<{ id: string }>('INSERT INTO sessions (user_id, token_hash, expires_at, ip, user_agent) VALUES ($1,$2,$3,$4,$5) RETURNING id', [session.user_id, this.hashToken(newToken), expiresAt, metadata.ip ?? null, metadata.userAgent ?? null]);
      return { accessToken: await this.accessToken({ id: session.user_id, email: session.email, role: session.role }, inserted.rows[0].id), refreshToken: newToken, expiresAt };
    });
  }
  async logout(refreshToken: string, accessToken?: string) {
    let claims: JwtClaims | undefined;
    if (accessToken) {
      // Expired but correctly signed access tokens may revoke their own session.
      // This is a logout-only operation, never an authorization bypass.
      try {
        const verified = await this.jwt.verifyAsync<JwtClaims>(accessToken, { ignoreExpiration: true });
        if (typeof verified.sub === 'string' && typeof verified.sid === 'string') claims = verified;
      } catch { /* A bad access token must not prevent valid refresh-cookie logout. */ }
    }
    if (!refreshToken && !claims) return;
    await this.db.query(`UPDATE sessions SET revoked_at=now()
      WHERE revoked_at IS NULL AND (token_hash=$1 OR (id=$2 AND user_id=$3))`,
      [refreshToken ? this.hashToken(refreshToken) : null, claims?.sid ?? null, claims?.sub ?? null]);
  }
  async listSessions(user: JwtClaims) {
    const result = await this.db.query<{ id: string; created_at: string; expires_at: string; ip: string | null; user_agent: string | null }>('SELECT id,created_at,expires_at,ip::text,user_agent FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC', [user.sub]);
    return result.rows.map(session => ({ ...session, current: session.id === user.sid }));
  }
  async revokeSession(user: JwtClaims, sessionId: string) {
    if (sessionId === user.sid) throw new ConflictException('Bu cihazdaki oturumu çıkış düğmesinden kapatın');
    return this.db.transaction(async client => {
      const revoked = await client.query<{ id: string }>('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() RETURNING id', [sessionId, user.sub]);
      if (!revoked.rowCount) throw new NotFoundException('Açık oturum bulunamadı');
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)', [user.sub, 'session.revoked', 'session', sessionId]);
      return { id: sessionId, revoked: true };
    });
  }
  async revokeOtherSessions(user: JwtClaims) {
    return this.db.transaction(async client => {
      const revoked = await client.query<{ id: string }>('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL AND expires_at>now() RETURNING id', [user.sub, user.sid]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)', [user.sub, 'session.others_revoked', 'session', user.sid, JSON.stringify({ revokedCount: revoked.rowCount ?? 0 })]);
      return { revokedCount: revoked.rowCount ?? 0 };
    });
  }
}
