import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsUUID } from 'class-validator';

export class BulkProductStatusDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsUUID('4', { each: true }) ids!: string[];
  @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED']) status!: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}
