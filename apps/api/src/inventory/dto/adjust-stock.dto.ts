import { IsInt, IsUUID, MaxLength, Min } from 'class-validator';
export class AdjustStockDto {
  @IsUUID() productId!: string;
  @IsUUID() warehouseId!: string;
  @IsInt() @Min(1) quantity!: number;
  @MaxLength(500) reason!: string;
}
