import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtClaims, RequestUser } from './auth.types';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>(); const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Bearer token required');
    try {
      const claims = await this.jwt.verifyAsync<JwtClaims>(token);
      const active = await this.db.query<{ exists: boolean }>('SELECT EXISTS(SELECT 1 FROM sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at > now()) AS exists', [claims.sid, claims.sub]);
      if (!active.rows[0]?.exists) throw new UnauthorizedException('Session is invalid or expired');
      request.user = { id: claims.sub, email: claims.email, role: claims.role, sessionId: claims.sid }; return true;
    }
    catch { throw new UnauthorizedException('Invalid access token'); }
  }
}
