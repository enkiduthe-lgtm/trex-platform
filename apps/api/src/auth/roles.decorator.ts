import { SetMetadata } from '@nestjs/common';
import { Role } from './roles';
export const REQUIRED_ROLES = 'required_roles';
export const RequireRoles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);
