import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtClaims, RequestUser } from './auth.types';
import { Role } from './roles';
import { DatabaseService } from '../database/database.service';
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>(); const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Bearer token required');
    try {
      const claims = await this.jwt.verifyAsync<JwtClaims>(token);
      const active = await this.db.query<{ email: string; role: Role }>('SELECT u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at > now() AND u.is_active=true', [claims.sid, claims.sub]);
      const user = active.rows[0];
      if (!user) throw new UnauthorizedException('Session is invalid or expired');
      request.user = { id: claims.sub, email: user.email, role: user.role, sessionId: claims.sid }; return true;
    }
    catch { throw new UnauthorizedException('Invalid access token'); }
  }
}
