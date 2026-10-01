import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { Role, Roles } from '../roles';
export class CreateStaffUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(12) password!: string;
  @IsEnum(Roles) role!: Exclude<Role, 'SUPER_ADMIN' | 'DEALER' | 'CUSTOMER'>;
}
