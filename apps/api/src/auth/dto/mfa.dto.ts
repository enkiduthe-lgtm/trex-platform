import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class MfaCodeDto {
  @IsString() @Matches(/^\d{6}$/) code!: string;
}

export class DisableMfaDto extends MfaCodeDto {
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
}
