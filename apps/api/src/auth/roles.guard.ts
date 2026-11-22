import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { RequestUser } from './auth.types';
import { REQUIRED_ROLES } from './roles.decorator';
import { Role } from './roles';
import { DatabaseService } from '../database/database.service';
import { normalizeAccessPath, requestAccess } from './staff-access';
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector,@Optional() private readonly db?:DatabaseService) {}
  async canActivate(context: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES, [context.getHandler(), context.getClass()]);
    const request = context.switchToHttp().getRequest<Request & { user?: RequestUser }>();const user=request.user;
    const path=normalizeAccessPath(request.path??''),method=(request.method??'').toUpperCase();
    if(user?.role==='SUPER_ADMIN'&&(/^\/(v1\/)?admin(\/|$)/.test(path)||/^\/(v1\/)?(returns|inventory|health)(\/|$)/.test(path)))return true;
    if(user?.role==='ADMIN'&&this.db&&!/^\/(v1\/)?admin\/(access\/me|settings\/manager-menu)$/.test(path)){
      const profile=await this.db.query<{grants:string[]}>('SELECT grants FROM staff_access_profiles WHERE user_id=$1',[user.id]);
      if(profile.rowCount){
        const permission=requestAccess(path,method);
        const grants=profile.rows[0].grants;
        const status=request.body?.status;
        const cargoUpdate=method==='PATCH' && /^\/(v1\/)?admin\/orders\/[^/]+\/status$/.test(path) &&
          (status==='SHIPPED'||status==='DELIVERED');
        if(!permission||!grants.includes(permission)||!grants.includes(permission.split('.')[0]+'.VIEW')||
          (cargoUpdate&&(!grants.includes('SHIPPING.VIEW')||!grants.includes('SHIPPING.APPROVE')))){
          throw new ForbiddenException('Bu İşlem İçin Müdür Tarafından Yetki Verilmemiş');
        }
        return true;
      }
    }
    if (!roles) return true;
    if (!user || !roles.includes(user.role)) throw new ForbiddenException('Insufficient role'); return true;
  }
}
