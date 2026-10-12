import { IsInt, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateInventoryCountDto {
  @IsUUID() productId!: string;
  @IsUUID() warehouseId!: string;
  @IsInt() @Min(0) actualQuantity!: number;
  @IsString() @MaxLength(500) reason!: string;
}
