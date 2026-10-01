import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
export class CreateDealerLevelDto { @IsString() @Matches(/^[A-Z0-9_]+$/) @MaxLength(50) code!: string; @IsString() @MaxLength(120) name!: string; @IsInt() @Min(1) sortOrder!: number; }
