import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { CreateProductDto } from './create-product.dto';

export class ImportProductsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(250)
  @ValidateNested({ each: true }) @Type(() => CreateProductDto)
  products!: CreateProductDto[];
}
