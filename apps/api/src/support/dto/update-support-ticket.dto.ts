import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateSupportTicketDto {
  @IsOptional() @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'RESOLVED', 'CLOSED']) status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
  @IsOptional() @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT']) priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  @IsOptional() @IsUUID() assignedTo?: string | null;
}
export class AddSupportMessageDto {
  @IsString() @MinLength(2) @MaxLength(5000) body!: string;
  @IsOptional() isInternal?: boolean;
}
