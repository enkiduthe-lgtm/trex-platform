import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateLegalDocumentDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(80) code!: string;
  @IsString() @MaxLength(80) version!: string;
  @IsString() @MaxLength(240) title!: string;
  @IsString() @MaxLength(50000) body!: string;
}
