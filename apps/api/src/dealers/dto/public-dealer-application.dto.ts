import { IsEmail, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
export class PublicDealerApplicationDto {
  @IsOptional() @IsString() @MaxLength(240) companyName?: string;
  @IsString() @MaxLength(160) contactName!: string;
  @IsEmail() @MaxLength(240) email!: string;
  @IsString() @MaxLength(128) password!: string;
  @IsString() @MaxLength(40) phone!: string;
  @IsString() @MaxLength(120) city!: string;
  @IsString() @MaxLength(120) district!: string;
  @IsString() @MaxLength(1000) address!: string;
  @IsOptional() @IsString() @MaxLength(80) iban?: string;
  @IsOptional() @IsString() @MaxLength(180) accountHolder?: string;
  @IsOptional() @IsString() @MaxLength(40) taxNumber?: string;
  @IsOptional() @IsString() @MaxLength(120) taxOffice?: string;
  @IsNumber() @Min(0) monthlySalesTarget!: number;
  @IsOptional() @IsString() @MaxLength(120) region?: string;
  @IsOptional() @IsString() @MaxLength(1000) salesChannels?: string;
  @IsOptional() @IsString() @MaxLength(500) socialMedia?: string;
}
