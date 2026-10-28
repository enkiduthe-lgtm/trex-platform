import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateDealerLevelDto {
  @IsString() @MaxLength(120) name!: string;
}

export class SetDealerLevelDto {
  @IsOptional() @IsUUID() dealerLevelId?: string | null;
}
