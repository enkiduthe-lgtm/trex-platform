import { IsEnum } from 'class-validator';
export enum OrderStatusUpdate { PROCESSING='PROCESSING', SHIPPED='SHIPPED', DELIVERED='DELIVERED', CANCELLED='CANCELLED' }
export class UpdateOrderStatusDto { @IsEnum(OrderStatusUpdate) status!: OrderStatusUpdate; }
