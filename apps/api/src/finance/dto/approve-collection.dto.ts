import { IsUUID } from 'class-validator';
export class ApproveCollectionDto { @IsUUID() orderId!: string; }
