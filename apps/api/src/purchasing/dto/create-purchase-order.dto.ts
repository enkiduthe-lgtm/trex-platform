import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
class PurchaseOrderItemDto { @IsUUID() productId!:string; @Type(()=>Number) @IsInt() @Min(1) quantity!:number; @Type(()=>Number) @IsNumber({maxDecimalPlaces:2}) @Min(0) unitCost!:number; }
export class CreatePurchaseOrderDto { @IsUUID() supplierId!:string; @IsUUID() warehouseId!:string; @IsOptional() @IsIn(['TRY','EUR','USD']) currency?:'TRY'|'EUR'|'USD'; @IsOptional() @IsDateString() expectedAt?:string; @IsOptional() @IsString() @MaxLength(1000) note?:string; @IsArray() @ArrayMinSize(1) @ValidateNested({each:true}) @Type(()=>PurchaseOrderItemDto) items!:PurchaseOrderItemDto[]; }
