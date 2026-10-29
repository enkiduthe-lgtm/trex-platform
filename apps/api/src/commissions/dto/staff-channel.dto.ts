import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsInt, IsNumber, IsUUID, Max, Min } from 'class-validator';
export class StaffSettingsDto {
 @IsInt() @Min(1) @Max(100) executiveCount!:number;
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4',{each:true}) executiveIds!:string[];
 @IsUUID() directorId!:string;
}
export class StaffRateDto {
 @IsUUID() productId!:string;
 @IsIn(['RETAIL','WHOLESALE','DEALER']) channelGroup!:string;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) executiveAmount!:number;
 @IsNumber({maxDecimalPlaces:2}) @Min(0) @Max(9999999999.99) directorAmount!:number;
}
