import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateShipmentStatusDto {
  @IsIn(['IN_TRANSIT','DELIVERED','FAILED','CANCELLED']) status!: 'IN_TRANSIT'|'DELIVERED'|'FAILED'|'CANCELLED';
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
