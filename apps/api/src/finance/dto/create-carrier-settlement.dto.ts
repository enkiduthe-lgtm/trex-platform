import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateCarrierSettlementDto {
  @IsUUID() accountId!: string;
  @IsString() @MaxLength(80) carrierName!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) grossCollectionAmount!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) shippingDeductionAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) otherDeductionAmount?: number;
  @IsDateString() expectedPayoutDate!: string;
  @IsOptional() @IsString() @MaxLength(120) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
