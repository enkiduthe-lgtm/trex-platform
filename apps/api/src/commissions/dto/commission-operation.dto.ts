import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class PayCommissionDto {
  @IsUUID() accountId!: string;
  @IsOptional() @IsString() @MaxLength(120) referenceNumber?: string;
}

export class ReverseCommissionDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class CreateCommissionRuleV5Dto {
  @IsUUID() productId!: string;
  @IsUUID() recipientUserId!: string;
  @IsIn(['STAFF','MANAGER']) recipientKind!: 'STAFF' | 'MANAGER';
  @IsIn(['RETAIL','WHOLESALE','DEALER']) salesChannelGroup!: 'RETAIL' | 'WHOLESALE' | 'DEALER';
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(9999999999.99) amountPerUnit!: number;
}
