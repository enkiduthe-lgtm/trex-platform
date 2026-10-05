import { IsUUID } from 'class-validator';
export class CreatePickDto { @IsUUID() orderId!: string; @IsUUID() warehouseId!: string; }
