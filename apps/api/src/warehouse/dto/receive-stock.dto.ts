import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsUUID() productId!: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() @MaxLength(100) lotCode?: string;
  @IsOptional() @IsDateString() receivedAt?: string;
  @IsOptional() @IsDateString() expiryDate?: string;
  @IsOptional() @IsString() @MaxLength(100) locationCode?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
