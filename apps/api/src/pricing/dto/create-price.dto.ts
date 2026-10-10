import { IsEnum, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Matches, Min, ValidateIf } from 'class-validator';
export enum PriceScope { GLOBAL = 'GLOBAL', CHANNEL = 'CHANNEL', DEALER_LEVEL = 'DEALER_LEVEL', DEALER = 'DEALER', DEALER_PRICE_GROUP = 'DEALER_PRICE_GROUP' }
export enum SalesChannel { PUBLIC_WEB = 'PUBLIC_WEB', ADMIN_ORDER = 'ADMIN_ORDER', DEALER_PORTAL = 'DEALER_PORTAL' }
export class CreatePriceDto {
  @IsUUID() productId!: string;
  @IsEnum(PriceScope) scope!: PriceScope;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) amount!: number;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsISO8601() startsAt?: string;
  @IsOptional() @IsISO8601() endsAt?: string;
  @ValidateIf((x) => x.scope === PriceScope.CHANNEL) @IsEnum(SalesChannel) channel?: SalesChannel;
  @ValidateIf((x) => x.scope === PriceScope.DEALER_LEVEL) @IsUUID() dealerLevelId?: string;
  // Dealer table lands in the dealer sprint; UUID is stored now to support its future foreign key migration.
  @ValidateIf((x) => x.scope === PriceScope.DEALER) @IsUUID() dealerId?: string;
  @ValidateIf((x) => x.scope === PriceScope.DEALER_PRICE_GROUP) @IsUUID() dealerPriceGroupId?: string;
}
