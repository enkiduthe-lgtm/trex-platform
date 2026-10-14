import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
export class CheckoutLegalAcceptanceDto {
  @IsString() @MaxLength(80) code!: string;
  @IsString() @MaxLength(80) version!: string;
}
export class CreateCheckoutDto {
  @IsUUID() cartId!: string;
  @IsString() @MaxLength(128) guestKey!: string;
  @IsUUID() warehouseId!: string;
  @IsString() @MaxLength(160) recipientName!: string;
  @IsEmail() @MaxLength(254) contactEmail!: string;
  @IsString() @MaxLength(40) phone!: string;
  @IsString() @MaxLength(100) city!: string;
  @IsString() @MaxLength(100) district!: string;
  @IsString() @MaxLength(500) addressLine!: string;
  @IsOptional() @IsString() @MaxLength(20) postalCode?: string;
  @IsInt() @Min(1) reservationMinutes!: number;
  @IsOptional() @IsString() @MaxLength(64) couponCode?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CheckoutLegalAcceptanceDto)
  legalAcceptances?: CheckoutLegalAcceptanceDto[];
}
