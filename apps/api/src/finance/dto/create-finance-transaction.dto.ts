import { IsEnum, IsISO8601, IsOptional, IsString, IsUUID, MaxLength, Min, IsNumber } from 'class-validator';

export enum FinanceTransactionKind { INCOME = 'INCOME', EXPENSE = 'EXPENSE', COLLECTION = 'COLLECTION', REFUND = 'REFUND', COMMISSION = 'COMMISSION', PRIME_EXPENSE = 'PRIME_EXPENSE', MANUAL = 'MANUAL' }
export enum FinancePaymentStatus { PENDING = 'PENDING', PARTIALLY_PAID = 'PARTIALLY_PAID', PAID = 'PAID', REFUNDED = 'REFUNDED', PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED', COLLECTION_PENDING = 'COLLECTION_PENDING', OVERDUE = 'OVERDUE' }
export class CreateFinanceTransactionDto {
  @IsUUID() accountId!: string;
  @IsEnum(FinanceTransactionKind) kind!: FinanceTransactionKind;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @MaxLength(1000) description!: string;
  @IsOptional() @IsEnum(FinancePaymentStatus) paymentStatus?: FinancePaymentStatus;
  @IsOptional() @IsString() @MaxLength(240) counterpartyName?: string;
  @IsOptional() @IsString() @MaxLength(120) referenceNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) expenseCategory?: string;
  @IsOptional() @IsString() @MaxLength(120) costCenter?: string;
  @IsOptional() @IsString() @MaxLength(1000) documentUrl?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
}
export class CreateFinanceTransferDto {
  @IsUUID() fromAccountId!: string;
  @IsUUID() toAccountId!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @MaxLength(1000) description!: string;
}
