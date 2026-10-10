import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateCurrentAccountEntryDto {
  @IsIn(['DEALER','CUSTOMER']) partyType!: 'DEALER' | 'CUSTOMER';
  @IsUUID() partyId!: string;
  @IsIn(['SALE','COLLECTION','RETURN','COMMISSION_USE','ADJUSTMENT']) entryType!: 'SALE' | 'COLLECTION' | 'RETURN' | 'COMMISSION_USE' | 'ADJUSTMENT';
  @IsOptional() @IsIn(['DEBIT','CREDIT']) direction?: 'DEBIT' | 'CREDIT';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsOptional() @IsIn(['TRY','EUR','USD']) currency?: 'TRY' | 'EUR' | 'USD';
  @IsString() @MaxLength(80) sourceType!: string;
  @IsOptional() @IsUUID() sourceId?: string;
  @IsString() @MaxLength(500) description!: string;
}
