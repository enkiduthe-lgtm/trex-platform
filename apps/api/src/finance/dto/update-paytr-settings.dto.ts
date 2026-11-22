import { IsNumber, IsOptional, Max, Min } from 'class-validator';
export class UpdatePaytrSettingsDto {
  @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) commissionRate!:number;
  @IsOptional() @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) expectedCommissionRate?:number;
}
