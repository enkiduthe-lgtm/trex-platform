import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { AdminOrderPriceDto } from './update-admin-order-prices.dto';

export class AdminOrderEditItemDto extends AdminOrderPriceDto {
  @IsInt() @Min(1) @Max(100000) quantity!: number;
}
export class UpdateAdminOrderDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) version!: string;
  @IsString() @MinLength(1) @MaxLength(500) reason!: string;
  @IsString() @MinLength(1) @MaxLength(160) recipientName!: string;
  @IsEmail() @MaxLength(254) contactEmail!: string;
  @IsString() @MinLength(1) @MaxLength(40) phone!: string;
  @IsString() @MinLength(1) @MaxLength(100) city!: string;
  @IsString() @MinLength(1) @MaxLength(100) district!: string;
  @IsString() @MinLength(1) @MaxLength(500) addressLine!: string;
  @IsString() @MaxLength(20) postalCode!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100)
  @ValidateNested({each:true}) @Type(()=>AdminOrderEditItemDto) items!: AdminOrderEditItemDto[];
}
