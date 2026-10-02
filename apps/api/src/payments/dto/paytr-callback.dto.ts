import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaytrCallbackDto {
  @IsString() @MaxLength(120) merchant_oid!: string;
  @IsIn(['success', 'failed']) status!: 'success' | 'failed';
  @IsString() @MaxLength(32) total_amount!: string;
  @IsString() @MaxLength(512) hash!: string;
  @IsOptional() @IsString() @MaxLength(1000) failed_reason_code?: string;
  @IsOptional() @IsString() @MaxLength(1000) failed_reason_msg?: string;
}
