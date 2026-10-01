import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
export class CreateProductCostDto {
  @IsUUID() productId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) unitCost!: number;
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @MaxLength(240) supplierName?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
