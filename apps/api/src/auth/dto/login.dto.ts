import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
export class LoginDto {
  @IsEmail() @MaxLength(320) email!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @IsOptional() @IsString() @Matches(/^\d{6}$/) mfaCode?: string;
}
