import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class PayCommissionDto {
  @IsUUID() accountId!: string;
  @IsOptional() @IsString() referenceNumber?: string;
}

export class ReverseCommissionDto {
  @IsOptional() @IsString() note?: string;
}

export class CreateCommissionRuleV5Dto {
  @IsUUID() productId!: string;
  @IsUUID() recipientUserId!: string;
  @IsString() recipientKind!: 'STAFF' | 'MANAGER';
  @IsIn(['RETAIL','WHOLESALE','DEALER']) salesChannelGroup!: 'RETAIL' | 'WHOLESALE' | 'DEALER';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amountPerUnit!: number;
}
