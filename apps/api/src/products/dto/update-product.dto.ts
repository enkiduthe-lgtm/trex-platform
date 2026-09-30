import { IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
export class UpdateProductDto {
  @IsInt() @Min(1) version!: number;
  @IsOptional() @IsString() @MaxLength(64) barcode?: string | null;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(160) slug?: string;
  @IsOptional() @IsString() @MaxLength(240) name?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED']) status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}
