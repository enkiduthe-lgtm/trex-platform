import { IsIn, IsString, IsUUID, MaxLength } from 'class-validator';

export class InitializeManualPaymentDto {
  @IsUUID()
  checkoutId!: string;

  @IsString()
  @MaxLength(128)
  guestKey!: string;

  @IsIn(['TRANSFER', 'COD', 'CASH'])
  method!: 'TRANSFER' | 'COD' | 'CASH';
}
