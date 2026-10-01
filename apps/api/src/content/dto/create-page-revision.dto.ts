import { IsObject } from 'class-validator';

export class CreatePageRevisionDto { @IsObject() content!: Record<string, unknown>; }
