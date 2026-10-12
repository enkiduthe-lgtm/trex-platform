import { IsInt, Max, Min } from 'class-validator';

export class UpdateReorderLevelDto {
  @IsInt() @Min(0) @Max(1000000) minimumQuantity!: number;
  @IsInt() @Min(0) @Max(1000000) targetQuantity!: number;
}
