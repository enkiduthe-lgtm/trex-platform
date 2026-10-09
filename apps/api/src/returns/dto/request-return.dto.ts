import { IsArray, IsEmail, IsInt, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
class ReturnItemDto { @IsUUID() orderItemId!: string; @IsInt() @Min(1) quantity!: number; }
export class RequestReturnDto { @IsUUID() orderId!: string; @IsEmail() contactEmail!: string; @IsString() reason!: string; @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items!: ReturnItemDto[]; }
