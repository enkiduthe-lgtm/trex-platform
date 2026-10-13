import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';
export class ReviewReturnDto { @IsOptional() @IsString() notes?: string; }
export class ReceiveReturnDto { @IsOptional() @IsString() notes?: string; }
class ReturnInspectionItemDto { @IsUUID() returnItemId!: string; @IsIn(['SELLABLE','QUARANTINE','DAMAGED']) disposition!: 'SELLABLE'|'QUARANTINE'|'DAMAGED'; }
export class InspectReturnDto { @IsUUID() warehouseId!: string; @IsOptional() @IsIn(['SELLABLE','QUARANTINE','DAMAGED']) disposition?: 'SELLABLE'|'QUARANTINE'|'DAMAGED'; @IsOptional() @IsArray() @ValidateNested({ each:true }) @Type(() => ReturnInspectionItemDto) items?: ReturnInspectionItemDto[]; @IsOptional() @IsString() notes?: string; }
export class RefundReturnDto { @IsUUID() accountId!: string; @IsNumber({maxDecimalPlaces:2}) @Min(0.01) amount!: number; @IsOptional() @IsString() referenceNumber?: string; }
