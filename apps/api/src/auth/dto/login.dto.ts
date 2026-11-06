import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
  @IsIn(['MASTER','ADMIN','DEALER']) audience!: 'MASTER' | 'ADMIN' | 'DEALER';
  @IsOptional() @IsString() @Matches(/^\d{6}$/) mfaCode?: string;
}
