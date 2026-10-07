import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export class AdminOrderItemDto {
  @IsUUID() productId!: string;
  @IsInt() @Min(1) @Max(100000) quantity!: number;
  @ValidateIf((_object,value)=>value!==undefined) @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) unitAmount?: number;
}
export class CreateAdminOrderDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsUUID() warehouseId!: string;
  @IsString() @MinLength(1) @MaxLength(160) recipientName!: string;
  @IsEmail() @MaxLength(254) contactEmail!: string;
  @IsString() @MinLength(1) @MaxLength(40) phone!: string;
  @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @IsString() @MinLength(1) @MaxLength(100) district!: string;
  @IsString() @MinLength(1) @MaxLength(500) addressLine!: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsIn(['TRANSFER', 'COD_CARD', 'COD_CASH', 'HAND_CASH']) paymentMethod!: 'TRANSFER' | 'COD_CARD' | 'COD_CASH' | 'HAND_CASH';
  @ValidateIf((_object,value)=>value!==undefined) @IsIn(['TRY','EUR','USD']) currency?: 'TRY' | 'EUR' | 'USD';
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) priceChangeReason?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({ each: true }) @Type(() => AdminOrderItemDto) items!: AdminOrderItemDto[];
}
