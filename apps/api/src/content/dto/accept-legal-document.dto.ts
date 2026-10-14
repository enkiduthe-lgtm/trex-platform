import { IsString, MaxLength } from 'class-validator';

export class AcceptLegalDocumentDto {
  @IsString() @MaxLength(80) version!: string;
}
