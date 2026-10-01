import { IsEnum } from 'class-validator';
export enum DealerStatus { PENDING = 'PENDING', RECEIVED = 'RECEIVED', REVIEWING = 'REVIEWING', DOCUMENTS_REQUESTED = 'DOCUMENTS_REQUESTED', ACTIVE = 'ACTIVE', SUSPENDED = 'SUSPENDED', REJECTED = 'REJECTED' }
export class UpdateDealerStatusDto { @IsEnum(DealerStatus) status!: DealerStatus; }
