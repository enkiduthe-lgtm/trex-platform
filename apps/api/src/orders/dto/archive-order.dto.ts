import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
export class ArchiveOrderDto { @IsString() @MinLength(3) @MaxLength(1000) reason!: string; @IsOptional() @IsString() @MaxLength(40) testOrderNumber?:string; }
