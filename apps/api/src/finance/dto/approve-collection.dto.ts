import { IsString, MaxLength } from 'class-validator';

export class ApproveCollectionDto {
  // Yönetici ekrandaki sipariş numarasını (ör. TRX-10025) ya da teknik kaydı kullanabilir.
  @IsString() @MaxLength(120) orderId!: string;
}
