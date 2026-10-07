import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { Role, Roles } from '../roles';
export class CreateStaffUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsIn([Roles.ADMIN, Roles.WAREHOUSE, Roles.FINANCE]) role!: Exclude<Role, 'SUPER_ADMIN' | 'DEALER' | 'CUSTOMER'>;
}
