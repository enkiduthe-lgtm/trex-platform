import { IsEnum } from 'class-validator';
export enum DealerStatus { PENDING = 'PENDING', ACTIVE = 'ACTIVE', SUSPENDED = 'SUSPENDED', REJECTED = 'REJECTED' }
export class UpdateDealerStatusDto { @IsEnum(DealerStatus) status!: DealerStatus; }
