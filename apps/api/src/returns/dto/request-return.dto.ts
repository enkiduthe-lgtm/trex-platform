import { ArrayMinSize, ArrayUnique, IsArray, IsEmail, IsInt, IsString, IsUUID, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
class ReturnItemDto { @IsUUID() orderItemId!: string; @IsInt() @Min(1) quantity!: number; }
export class RequestReturnDto {
  @IsUUID() orderId!: string;
  @IsEmail() contactEmail!: string;
  @IsString() @Matches(/\S/) reason!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique((item: ReturnItemDto | null) =>
    typeof item?.orderItemId === 'string' ? item.orderItemId.toLowerCase() : item?.orderItemId)
  @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items!: ReturnItemDto[];
}
