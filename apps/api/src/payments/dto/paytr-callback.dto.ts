import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class PaytrCallbackDto {
  @IsString() @MaxLength(120) merchant_oid!: string;
  @IsIn(['success', 'failed']) status!: 'success' | 'failed';
  @IsString() @MaxLength(32) total_amount!: string;
  @IsString() @MaxLength(512) hash!: string;
  @IsOptional() @IsString() @MaxLength(1000) failed_reason_code?: string;
  @IsOptional() @IsString() @MaxLength(1000) failed_reason_msg?: string;
  @IsOptional() @IsIn(['0', '1']) test_mode?: string;
  @IsOptional() @IsIn(['card', 'eft']) payment_type?: string;
  @IsOptional() @IsIn(['TL', 'TRY', 'USD', 'EUR', 'GBP', 'RUB']) currency?: string;
  @IsOptional() @IsString() @MaxLength(32) payment_amount?: string;
}
