import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RequestUser } from './auth.types';
import { REQUIRED_ROLES } from './roles.decorator';
import { Role } from './roles';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]); if (!roles) return true;
    const user = context.switchToHttp().getRequest<Request & { user?: RequestUser }>().user;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Insufficient role'); return true;
  }
}
