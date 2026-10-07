import { IsEmail, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
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
}
