import { IsEnum, IsIn, ValidateIf, IsString, MaxLength } from 'class-validator';

export enum FinanceAccountType { BANK = 'BANK', CASH = 'CASH', MARKETPLACE = 'MARKETPLACE', COD_PENDING = 'COD_PENDING', FOREIGN_CURRENCY = 'FOREIGN_CURRENCY' }
export class CreateFinanceAccountDto {
  @IsString() @MaxLength(120) name!: string;
  @IsEnum(FinanceAccountType) accountType!: FinanceAccountType;
  @ValidateIf((_object,value)=>value!==undefined) @IsIn(['TRY','EUR','USD']) currency?: 'TRY' | 'EUR' | 'USD';
}
