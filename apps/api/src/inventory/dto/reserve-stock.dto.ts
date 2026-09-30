import { IsInt, IsUUID, Min } from 'class-validator';
export class ReserveStockDto {
  @IsUUID() productId!: string;
  @IsUUID() warehouseId!: string;
  @IsInt() @Min(1) quantity!: number;
  @IsUUID() referenceId!: string;
  @IsInt() @Min(1) ttlMinutes!: number;
}
