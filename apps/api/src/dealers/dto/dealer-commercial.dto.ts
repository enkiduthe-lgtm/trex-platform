import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, IsNumber } from 'class-validator';

export class CreateDealerPriceGroupDto {
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MaxLength(50) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}
export class SetDealerPriceGroupDto { @IsOptional() @IsUUID() priceGroupId?: string | null; }
export class CreateDealerBankAccountDto {
  @IsString() @MaxLength(160) accountHolder!: string;
  @IsString() @Matches(/^TR[0-9]{24}$/) iban!: string;
  @IsOptional() isPrimary?: boolean;
}
export class CreateDealerLedgerEntryDto {
  @IsIn(['DEBIT','CREDIT']) direction!: 'DEBIT' | 'CREDIT';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsOptional() @IsIn(['TRY','EUR','USD']) currency?: 'TRY' | 'EUR' | 'USD';
  @IsString() @MaxLength(120) referenceType!: string;
  @IsString() @MaxLength(500) description!: string;
}
