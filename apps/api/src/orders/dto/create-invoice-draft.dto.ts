import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateInvoiceDraftDto {
  @IsIn(['INDIVIDUAL','CORPORATE']) customerType!: 'INDIVIDUAL'|'CORPORATE';
  @IsString() @MaxLength(240) recipientName!: string;
  @IsOptional() @Matches(/^\d{11}$/) identityNumber?: string;
  @IsOptional() @IsString() @MaxLength(240) companyName?: string;
  @IsOptional() @Matches(/^\d{10}$/) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) taxOffice?: string;
  @IsString() @MaxLength(1000) billingAddress!: string;
  @IsOptional() @IsString() @MaxLength(120) billingCity?: string;
  @IsOptional() @IsString() @MaxLength(120) billingDistrict?: string;
}
