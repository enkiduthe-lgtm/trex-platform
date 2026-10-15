import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateSupportTicketDto {
  @IsString() @MinLength(2) @MaxLength(160) contactName!: string;
  @IsOptional() @IsEmail() contactEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsString() @MinLength(3) @MaxLength(200) subject!: string;
  @IsString() @MinLength(2) @MaxLength(5000) message!: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() orderId?: string;
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
}
