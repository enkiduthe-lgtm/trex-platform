import { IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
export class CreateCommissionRuleDto { @IsOptional() @IsUUID() dealerLevelId?: string; @IsOptional() @IsUUID() productId?: string; @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amountPerUnit!: number; }
