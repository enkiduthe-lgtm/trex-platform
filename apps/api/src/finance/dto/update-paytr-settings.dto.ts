import { IsNumber, Max, Min } from 'class-validator';
export class UpdatePaytrSettingsDto {
  @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(100) commissionRate!:number;
}
