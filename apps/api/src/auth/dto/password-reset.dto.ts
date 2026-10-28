import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
