import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class CreateDealerDto {
  @IsString() @Matches(/^[A-Z0-9_-]+$/) @MaxLength(50) code!: string;
  @IsString() @MaxLength(240) companyName!: string;
  @IsOptional() @IsString() @MaxLength(30) taxNumber?: string;
  @IsOptional() @IsUUID() parentDealerId?: string;
  @IsOptional() @IsUUID() dealerLevelId?: string;
}
