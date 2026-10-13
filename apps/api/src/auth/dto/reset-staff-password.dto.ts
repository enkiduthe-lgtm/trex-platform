import { IsString, MinLength } from 'class-validator';

export class ResetStaffPasswordDto {
  @IsString() @MinLength(12) password!: string;
}
