import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PoolClient } from 'pg';
import { DatabaseService } from '../database/database.service';
import { JwtClaims } from './auth.types';
import { Role, Roles } from './roles';
import { MfaService } from './mfa.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationChannel } from '../notifications/dto/create-notification.dto';

interface UserRow { id: string; email: string; password_hash: string; role: Role; is_active: boolean; mfa_secret_ciphertext: string | null; mfa_enabled_at: Date | null; }
interface SessionRow { id: string; user_id: string; email: string; role: Role; }

@Injectable()
export class AuthService {
  constructor(private readonly db: DatabaseService, private readonly jwt: JwtService, private readonly mfa: MfaService, @Optional() private readonly notifications?: NotificationsService) {}
  private hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
  private async accessToken(user: Pick<UserRow, 'id' | 'email' | 'role'>, sessionId: string) { return this.jwt.signAsync({ sub: user.id, email: user.email, role: user.role, sid: sessionId } satisfies JwtClaims); }
  private expiry() { const days = Number(process.env.SESSION_TTL_DAYS ?? 30); return new Date(Date.now() + days * 86400000); }
  async login(email: string, password: string, metadata: { ip?: string; userAgent?: string }, mfaCode?: string) {
    const user = (await this.db.query<UserRow>('SELECT id,email,password_hash,role,is_active,mfa_secret_ciphertext,mfa_enabled_at FROM users WHERE email=$1', [email.toLowerCase()])).rows[0];
    if (!user || !user.is_active || !(await argon2.verify(user.password_hash, password))) throw new UnauthorizedException('Invalid credentials');
    this.mfa.verifyLogin(user, mfaCode); return this.createSession(user, metadata);
  }
  async requestPasswordReset(email: string, metadata: { ip?: string; userAgent?: string }) {
    const generic = { message: 'E-posta Adresi Sistemde Kayıtlıysa Şifre Sıfırlama Bağlantısı Gönderildi.' };
    const allowed: Role[] = [Roles.SUPER_ADMIN, Roles.ADMIN, Roles.WAREHOUSE, Roles.FINANCE, Roles.DEALER];
    const user = (await this.db.query<Pick<UserRow, 'id' | 'email' | 'role'>>('SELECT id,email,role FROM users WHERE email=$1 AND is_active=true AND role=ANY($2::user_role[])', [email.trim().toLowerCase(), allowed])).rows[0];
    if (!user) return generic;
    const token = randomBytes(32).toString('base64url');
    await this.db.transaction(async client => {
      await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL', [user.id]);
      await client.query('INSERT INTO password_reset_tokens(user_id,token_hash,expires_at,requested_ip,requested_user_agent) VALUES($1,$2,$3,$4,$5)', [user.id, this.hashToken(token), new Date(Date.now() + 900000), metadata.ip ?? null, metadata.userAgent ?? null]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES(NULL,$1,$2,$3,$4)', ['auth.password_reset.requested', 'user', user.id, JSON.stringify({ role: user.role })]);
    });
    const base = (process.env.ADMIN_APP_URL ?? 'http://localhost:3001').replace(/\/$/, '');
    const url = base + '/sifre-sifirla?token=' + encodeURIComponent(token);
    try { await this.notifications?.send({ channel: NotificationChannel.EMAIL, recipient: user.email, subject: 'TREX Tea Şifre Sıfırlama', body: 'TREX Tea Paneliniz İçin Şifre Sıfırlama Bağlantınız:\n\n' + url + '\n\nBu Bağlantı 15 Dakika Geçerlidir Ve Yalnızca Bir Kez Kullanılabilir.' }, user.id); } catch { /* Notification queue records delivery failures. */ }
    return generic;
  }
  async confirmPasswordReset(token: string, password: string) {
    return this.db.transaction(async client => {
      const reset = await client.query<{ id: string; user_id: string }>('SELECT prt.id,prt.user_id FROM password_reset_tokens prt JOIN users u ON u.id=prt.user_id WHERE prt.token_hash=$1 AND prt.used_at IS NULL AND prt.expires_at>now() AND u.is_active=true FOR UPDATE', [this.hashToken(token)]);
      const record = reset.rows[0]; if (!record) throw new BadRequestException('Bağlantı Geçersiz Veya Süresi Dolmuş. Lütfen Yeniden Şifre Sıfırlama İsteği Oluşturun.');
      const hash = await argon2.hash(password, { type: argon2.argon2id });
      await client.query('UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2', [hash, record.user_id]);
      await client.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1', [record.id]);
      await client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [record.user_id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(NULL,$1,$2,$3)', ['auth.password_reset.completed', 'user', record.user_id]);
      return { message: 'Yeni Şifreniz Oluşturuldu. Yeni Şifrenizle Giriş Yapabilirsiniz.' };
    });
  }
  private async createSession(user: Pick<UserRow, 'id' | 'email' | 'role'>, metadata: { ip?: string; userAgent?: string }) { const refreshToken = randomBytes(48).toString('base64url'); const expiresAt = this.expiry(); const session = await this.db.query<{ id: string }>('INSERT INTO sessions (user_id,token_hash,expires_at,ip,user_agent) VALUES($1,$2,$3,$4,$5) RETURNING id', [user.id,this.hashToken(refreshToken),expiresAt,metadata.ip ?? null,metadata.userAgent ?? null]); return { accessToken: await this.accessToken(user, session.rows[0].id), refreshToken, expiresAt }; }
  async rotate(refreshToken: string, metadata: { ip?: string; userAgent?: string }) { const hash = this.hashToken(refreshToken); return this.db.transaction(async (client: PoolClient) => { const result = await client.query<SessionRow>('SELECT s.id,s.user_id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.is_active FOR UPDATE', [hash]); const session = result.rows[0]; if (!session) throw new UnauthorizedException('Session is invalid or expired'); await client.query('UPDATE sessions SET revoked_at=now() WHERE id=$1',[session.id]); const newToken=randomBytes(48).toString('base64url'); const expiresAt=this.expiry(); const inserted=await client.query<{id:string}>('INSERT INTO sessions(user_id,token_hash,expires_at,ip,user_agent) VALUES($1,$2,$3,$4,$5) RETURNING id',[session.user_id,this.hashToken(newToken),expiresAt,metadata.ip ?? null,metadata.userAgent ?? null]); return { accessToken: await this.accessToken({id:session.user_id,email:session.email,role:session.role},inserted.rows[0].id), refreshToken:newToken,expiresAt }; }); }
  async logout(refreshToken: string, accessToken?: string) { let claims: JwtClaims | undefined; if (accessToken) { try { const verified=await this.jwt.verifyAsync<JwtClaims>(accessToken,{ignoreExpiration:true}); if(typeof verified.sub==='string'&&typeof verified.sid==='string') claims=verified; } catch {} } if (!refreshToken&&!claims) return; await this.db.query('UPDATE sessions SET revoked_at=now() WHERE revoked_at IS NULL AND (token_hash=$1 OR (id=$2 AND user_id=$3))',[refreshToken?this.hashToken(refreshToken):null,claims?.sid??null,claims?.sub??null]); }
  async listSessions(user: JwtClaims) { const result=await this.db.query<{id:string;created_at:string;expires_at:string;ip:string|null;user_agent:string|null}>('SELECT id,created_at,expires_at,ip::text,user_agent FROM sessions WHERE user_id=$1 AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at DESC',[user.sub]); return result.rows.map(session=>({...session,current:session.id===user.sid})); }
  async revokeSession(user: JwtClaims, sessionId: string) { if(sessionId===user.sid) throw new ConflictException('Bu Cihazdaki Oturumu Çıkış Düğmesinden Kapatın'); return this.db.transaction(async client=>{ const revoked=await client.query<{id:string}>('UPDATE sessions SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() RETURNING id',[sessionId,user.sub]); if(!revoked.rowCount) throw new NotFoundException('Açık Oturum Bulunamadı'); await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[user.sub,'session.revoked','session',sessionId]); return {id:sessionId,revoked:true}; }); }
  async revokeOtherSessions(user: JwtClaims) { return this.db.transaction(async client=>{ const revoked=await client.query<{id:string}>('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND id<>$2 AND revoked_at IS NULL AND expires_at>now() RETURNING id',[user.sub,user.sid]); await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[user.sub,'session.others_revoked','session',user.sid,JSON.stringify({revokedCount:revoked.rowCount??0})]); return {revokedCount:revoked.rowCount??0}; }); }
}
