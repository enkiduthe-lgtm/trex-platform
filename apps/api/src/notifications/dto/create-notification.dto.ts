import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
export enum NotificationChannel { EMAIL = 'EMAIL', SMS = 'SMS', PUSH = 'PUSH', IN_APP = 'IN_APP' }
export class CreateNotificationDto { @IsEnum(NotificationChannel) channel!: NotificationChannel; @IsString() @MaxLength(320) recipient!: string; @IsOptional() @IsString() @MaxLength(300) subject?: string; @IsString() @MaxLength(10000) body!: string; }
