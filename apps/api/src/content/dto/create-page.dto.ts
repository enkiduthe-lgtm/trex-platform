import { IsObject, IsString, Matches, MaxLength } from 'class-validator';
export class CreatePageDto { @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(160) slug!: string; @IsString() @MaxLength(240) title!: string; @IsObject() content!: Record<string, unknown>; }
