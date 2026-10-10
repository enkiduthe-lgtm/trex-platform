import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export class CreateFinanceBudgetDto {
  @IsDateString() periodStart!: string;
  @IsString() @MaxLength(120) expenseCategory!: string;
  @IsOptional() @IsString() @MaxLength(120) costCenter?: string;
  @IsNumber({maxDecimalPlaces:2}) @Min(0.01) amount!: number;
  @IsOptional() @IsIn(['TRY','EUR','USD']) currency?: 'TRY'|'EUR'|'USD';
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
