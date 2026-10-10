import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateSupplierDto { @IsString() @MaxLength(160) name!:string; @IsOptional() @IsString() @MaxLength(120) contactName?:string; @IsOptional() @IsString() @MaxLength(50) phone?:string; @IsOptional() @IsEmail() @MaxLength(200) email?:string; }
