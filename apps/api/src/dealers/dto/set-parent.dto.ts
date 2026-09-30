import { IsUUID } from 'class-validator';
export class SetParentDto { @IsUUID() parentDealerId!: string; }
