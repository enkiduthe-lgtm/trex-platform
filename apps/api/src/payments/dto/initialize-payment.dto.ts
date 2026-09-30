import { IsString, IsUUID, MaxLength } from 'class-validator';
export class InitializePaymentDto { @IsUUID() checkoutId!: string; @IsString() @MaxLength(128) guestKey!:string; }
