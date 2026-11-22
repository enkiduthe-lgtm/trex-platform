import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from './auth.types';
import { PoolClient } from 'pg';
import { createTotpSecret, verifyTotp } from './totp';

type MfaRow = { email: string; password_hash: string; mfa_secret_ciphertext: string | null; mfa_pending_secret_ciphertext: string | null; mfa_pending_expires_at: Date | null; mfa_enabled_at: Date | null };

@Injectable()
export class MfaService {
  private readonly key: Buffer;
  constructor(private readonly db: DatabaseService, config: ConfigService) {
    this.key = createHash('sha256').update(config.get<string>('MFA_ENCRYPTION_KEY') ?? config.getOrThrow<string>('JWT_SECRET')).digest();
  }
  private encrypt(value: string) { const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', this.key, iv); const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]); return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${body.toString('base64url')}`; }
  private decrypt(value: string) { const [iv, tag, body] = value.split('.'); if (!iv || !tag || !body) throw new Error('Invalid encrypted TOTP secret'); const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url')); decipher.setAuthTag(Buffer.from(tag, 'base64url')); return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8'); }
  private async row(id: string) { return (await this.db.query<MfaRow>('SELECT email,password_hash,mfa_secret_ciphertext,mfa_pending_secret_ciphertext,mfa_pending_expires_at,mfa_enabled_at FROM users WHERE id=$1 AND is_active=true', [id])).rows[0]; }
  async status(userId: string) { const user = await this.row(userId); if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı'); return { enabled: Boolean(user.mfa_enabled_at), pending: Boolean(user.mfa_pending_secret_ciphertext && user.mfa_pending_expires_at && user.mfa_pending_expires_at > new Date()) }; }
  private async lockedAccount(client:PoolClient,user:RequestUser){
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`trex.auth.sessions:${user.id}`]);
    const record=(await client.query<MfaRow>('SELECT email,password_hash,mfa_secret_ciphertext,mfa_pending_secret_ciphertext,mfa_pending_expires_at,mfa_enabled_at FROM users WHERE id=$1 AND is_active=true FOR UPDATE',[user.id])).rows[0];
    if(!record)throw new UnauthorizedException('Kullanıcı bulunamadı');
    const session=(await client.query<{family_id:string}>(`SELECT original.family_id FROM sessions original WHERE original.id=$1 AND original.user_id=$2 AND EXISTS (
      SELECT 1 FROM sessions active WHERE active.user_id=original.user_id AND active.family_id=original.family_id
        AND active.revoked_at IS NULL AND active.expires_at>clock_timestamp() AND active.created_at>clock_timestamp()-interval '2 hours'
    )`,[user.sessionId,user.id])).rows[0];
    if(!session)throw new UnauthorizedException('Oturumunuz kapandı. Yeniden giriş yapın.');
    return {record,familyId:session.family_id};
  }
  private closeOtherLogins(client:PoolClient,userId:string,familyId:string){
    return client.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND family_id<>$2 AND revoked_at IS NULL',[userId,familyId]);
  }
  async enroll(user: RequestUser) {
    return this.db.transaction(async client=>{
      const {record}=await this.lockedAccount(client,user);
      if(record.mfa_enabled_at)throw new ConflictException('İki aşamalı doğrulama zaten etkin. Yeni kurulum için önce mevcut doğrulamayı kapatın.');
      const secret=createTotpSecret();
      await client.query(`UPDATE users SET mfa_pending_secret_ciphertext=$1,mfa_pending_expires_at=clock_timestamp()+interval '10 minutes' WHERE id=$2`,[this.encrypt(secret),user.id]);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[user.id,'mfa.enrollment.started','user',user.id]);
      return {secret,otpauthUri:`otpauth://totp/Trex%20Tea:${encodeURIComponent(record.email)}?secret=${secret}&issuer=Trex%20Tea&algorithm=SHA1&digits=6&period=30`,expiresInSeconds:600};
    });
  }
  async confirm(user: RequestUser, code: string) {
    return this.db.transaction(async client=>{
      const {record,familyId}=await this.lockedAccount(client,user);
      if(record.mfa_enabled_at)throw new ConflictException('İki aşamalı doğrulama zaten etkin.');
      if(!record.mfa_pending_secret_ciphertext||!record.mfa_pending_expires_at||record.mfa_pending_expires_at<=new Date())throw new ConflictException('Kurulum kodunun süresi dolmuş. Yeni kurulum başlatın.');
      if(!verifyTotp(this.decrypt(record.mfa_pending_secret_ciphertext),code))throw new BadRequestException('Doğrulama kodu geçersiz');
      await client.query('UPDATE users SET mfa_secret_ciphertext=mfa_pending_secret_ciphertext,mfa_enabled_at=now(),mfa_pending_secret_ciphertext=NULL,mfa_pending_expires_at=NULL WHERE id=$1',[user.id]);
      await this.closeOtherLogins(client,user.id,familyId);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[user.id,'mfa.enabled','user',user.id]);
      return {enabled:true};
    });
  }
  async disable(user: RequestUser, password: string, code: string) {
    return this.db.transaction(async client=>{
      const {record,familyId}=await this.lockedAccount(client,user);
      if(!record.mfa_secret_ciphertext||!record.mfa_enabled_at||!(await argon2.verify(record.password_hash,password))||!verifyTotp(this.decrypt(record.mfa_secret_ciphertext),code))throw new UnauthorizedException('Şifre veya doğrulama kodu geçersiz');
      await client.query('UPDATE users SET mfa_secret_ciphertext=NULL,mfa_enabled_at=NULL,mfa_pending_secret_ciphertext=NULL,mfa_pending_expires_at=NULL WHERE id=$1',[user.id]);
      await this.closeOtherLogins(client,user.id,familyId);
      await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES($1,$2,$3,$4)',[user.id,'mfa.disabled','user',user.id]);
      return {enabled:false};
    });
  }
  verifyLogin(record: Pick<MfaRow, 'mfa_secret_ciphertext' | 'mfa_enabled_at'>, code?: string) { if (!record.mfa_enabled_at) return; if (!record.mfa_secret_ciphertext || !code || !verifyTotp(this.decrypt(record.mfa_secret_ciphertext), code)) throw new UnauthorizedException('İki aşamalı doğrulama kodu geçersiz'); }
}
