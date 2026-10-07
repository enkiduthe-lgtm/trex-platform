import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
export class AdminOrderPriceDto {
  @IsUUID() itemId!: string;
  @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) unitAmount!: number;
}
export class UpdateAdminOrderPricesDto {
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({each:true}) @Type(()=>AdminOrderPriceDto) items!: AdminOrderPriceDto[];
}
