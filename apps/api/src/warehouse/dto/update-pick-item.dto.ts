import { IsInt, Min } from 'class-validator';

export class UpdatePickItemDto {
  @IsInt()
  @Min(0)
  pickedQuantity!: number;
}
