import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
export class CreateProductDto {
  @IsString() @MaxLength(64) sku!: string;
  @IsOptional() @IsString() @MaxLength(64) barcode?: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(160) slug!: string;
  @IsString() @MaxLength(240) name!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE']) status?: 'DRAFT' | 'ACTIVE';
}
