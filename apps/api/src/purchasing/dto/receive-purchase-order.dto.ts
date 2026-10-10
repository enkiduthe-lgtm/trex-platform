import { IsDateString, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
export class ReceivePurchaseOrderDto { @IsUUID() itemId!:string; @IsInt() @Min(1) quantity!:number; @IsString() @MaxLength(100) lotCode!:string; @IsOptional() @IsDateString() expiryDate?:string; @IsOptional() @IsString() @MaxLength(100) locationCode?:string; }
