import { IsEmail, IsString, MaxLength } from 'class-validator';

export class TrackOrderQueryDto {
  @IsString()
  @MaxLength(40)
  number!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}
