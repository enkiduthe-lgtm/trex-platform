import { IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { NotificationChannel } from './create-notification.dto';
export class NotificationHistoryQueryDto {
  @IsOptional() @IsEnum(NotificationChannel) channel?:NotificationChannel;
  @IsOptional() @IsIn(['PENDING','RETRYING','SENT','FAILED','UNKNOWN']) status?:string;
  @IsOptional() @IsString() @MaxLength(200) q?:string;
  @IsOptional() @IsUUID() before?:string;
}
