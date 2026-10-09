import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ScanPickItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  barcode!: string;
}
