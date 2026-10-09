import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
export class ReviewReturnDto { @IsOptional() @IsString() notes?: string; }
export class ReceiveReturnDto { @IsOptional() @IsString() notes?: string; }
export class InspectReturnDto { @IsUUID() warehouseId!: string; @IsIn(['SELLABLE','QUARANTINE','DAMAGED']) disposition!: 'SELLABLE'|'QUARANTINE'|'DAMAGED'; @IsOptional() @IsString() notes?: string; }
export class RefundReturnDto { @IsUUID() accountId!: string; @IsNumber({maxDecimalPlaces:2}) @Min(0.01) amount!: number; @IsOptional() @IsString() referenceNumber?: string; }
