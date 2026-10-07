import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListAuditDto {
  @IsOptional() @IsString() @MaxLength(120) action?: string;
  @IsOptional() @IsString() @MaxLength(120) entityType?: string;
  @IsOptional() @IsString() @MaxLength(200) entityId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(2000) page: number = 1;
}
