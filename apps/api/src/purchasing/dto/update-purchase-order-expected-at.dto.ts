import { IsDateString } from 'class-validator';

export class UpdatePurchaseOrderExpectedAtDto {
  @IsDateString() expectedAt!: string;
}
