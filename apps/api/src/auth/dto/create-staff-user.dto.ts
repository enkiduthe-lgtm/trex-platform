import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { Role, Roles } from '../roles';
export class CreateStaffUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsIn([Roles.SUPER_ADMIN, Roles.ADMIN]) role!: Exclude<Role, 'DEALER' | 'CUSTOMER'>;
}
