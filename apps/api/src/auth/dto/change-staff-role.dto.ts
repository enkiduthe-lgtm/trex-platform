import { IsIn } from 'class-validator';
import { Roles } from '../roles';

export class ChangeStaffRoleDto {
  @IsIn([Roles.SUPER_ADMIN, Roles.ADMIN]) role!: 'SUPER_ADMIN' | 'ADMIN';
}
