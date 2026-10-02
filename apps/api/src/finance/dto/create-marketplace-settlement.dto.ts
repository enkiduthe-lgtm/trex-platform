import { IsISO8601, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateMarketplaceSettlementDto {
  @IsUUID() accountId!: string;
  @IsString() @MaxLength(80) marketplaceName!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) grossSalesAmount!: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) commissionAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) shippingCostAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) campaignContributionAmount?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) refundAmount?: number;
  @IsOptional() @IsString() @MaxLength(120) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
}
