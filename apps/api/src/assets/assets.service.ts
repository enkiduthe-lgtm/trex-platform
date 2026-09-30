import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
const allowed=['image/jpeg','image/png','image/webp','image/svg+xml'];
@Injectable()
export class AssetsService { constructor(private readonly db:DatabaseService){} async createMock(input:{filename:string;mimeType:string;byteSize:number;width?:number;height?:number;placement:string;userId:string}){if(!allowed.includes(input.mimeType))throw new BadRequestException('Unsupported image format');if(input.byteSize>2_000_000)throw new BadRequestException('Image exceeds 2 MB limit');const key=`mock/${randomUUID()}-${input.filename}`;const asset=await this.db.query<{id:string}>('INSERT INTO assets (original_filename,mime_type,byte_size,width,height,storage_key,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[input.filename,input.mimeType,input.byteSize,input.width??null,input.height??null,key,'READY',input.userId]);await this.db.query('INSERT INTO asset_usages (asset_id,placement) VALUES ($1,$2)',[asset.rows[0].id,input.placement]);return{assetId:asset.rows[0].id,storageKey:key,status:'READY'};}}
