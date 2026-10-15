import { IsIn } from 'class-validator';
import { Roles } from '../roles';

export class ChangeStaffRoleDto {
  @IsIn([Roles.ADMIN, Roles.WAREHOUSE, Roles.FINANCE]) role!: 'ADMIN' | 'WAREHOUSE' | 'FINANCE';
}
