import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export enum FinanceRecordKind { EXPENSE = 'EXPENSE', INCOMING_TRANSFER = 'INCOMING_TRANSFER' }
export class CreateFinanceRecordDto {
  @IsEnum(FinanceRecordKind) kind!: FinanceRecordKind;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount!: number;
  @IsString() @MaxLength(1000) description!: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsString() @MaxLength(240) counterpartyName?: string;
  @IsOptional() @IsString() @MaxLength(240) bankName?: string;
  @IsOptional() @IsString() @MaxLength(120) referenceNumber?: string;
}
