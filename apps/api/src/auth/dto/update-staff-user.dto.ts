import { IsBoolean } from 'class-validator';
export class UpdateStaffUserDto { @IsBoolean() isActive!: boolean; }
