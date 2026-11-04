import { BadRequestException, Injectable, InternalServerErrorException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { R2StorageService } from './r2-storage.service';
import { assertMockIntegrationAllowed } from '../config/mock-integration-policy';
const allowed=['image/jpeg','image/png','image/webp','image/svg+xml'];
@Injectable()
export class AssetsService {
  constructor(private readonly db:DatabaseService, private readonly storage:R2StorageService){}
  private validate(filename:string,mimeType:string,byteSize:number){if(!allowed.includes(mimeType))throw new BadRequestException('Unsupported image format');if(byteSize>2_000_000)throw new BadRequestException('Image exceeds 2 MB limit');if(!filename.trim())throw new BadRequestException('Filename is required');}
  async createMock(input:{filename:string;mimeType:string;byteSize:number;width?:number;height?:number;placement:string;userId:string}){assertMockIntegrationAllowed('ASSET_STORAGE');this.validate(input.filename,input.mimeType,input.byteSize);const key=`mock/${randomUUID()}-${input.filename}`;const asset=await this.db.query<{id:string}>('INSERT INTO assets (original_filename,mime_type,byte_size,width,height,storage_key,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[input.filename,input.mimeType,input.byteSize,input.width??null,input.height??null,key,'READY',input.userId]);await this.db.query('INSERT INTO asset_usages (asset_id,placement) VALUES ($1,$2)',[asset.rows[0].id,input.placement]);return{assetId:asset.rows[0].id,storageKey:key,status:'READY'};}
  async productImage(productId:string){const result=await this.db.query<{storage_key:string;mime_type:string}>('SELECT a.storage_key,a.mime_type FROM asset_usages usage JOIN assets a ON a.id=usage.asset_id WHERE usage.placement=$1 AND a.status=\'READY\' ORDER BY usage.created_at DESC LIMIT 1',[`PRODUCT_MAIN:${productId}`]);const asset=result.rows[0];if(!asset)throw new NotFoundException('Product image not found');return{buffer:await this.storage.get(asset.storage_key),mimeType:asset.mime_type};}
  async upload(input:{filename:string;mimeType:string;buffer:Buffer;placement:string;userId:string}) {
    this.validate(input.filename,input.mimeType,input.buffer.byteLength);
    const productId=input.placement.startsWith('PRODUCT_MAIN:')?input.placement.slice('PRODUCT_MAIN:'.length):null;
    if(productId!==null){
      if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId))throw new BadRequestException('Geçerli Bir Ürün Seçin');
      const product=await this.db.query('SELECT id FROM products WHERE id=$1',[productId]);
      if(!product.rowCount)throw new NotFoundException('Ürün Bulunamadı');
    }
    const extension=input.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'')||'image';
    const key=`assets/${randomUUID()}.${extension}`;
    const asset=await this.db.query<{id:string}>('INSERT INTO assets (original_filename,mime_type,byte_size,storage_key,status,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',[input.filename,input.mimeType,input.buffer.byteLength,key,'PENDING',input.userId]);
    const assetId=asset.rows[0].id;
    try {
      const storedUrl=await this.storage.put(key,input.buffer,input.mimeType);
      const publicUrl=storedUrl||(productId?`/v1/assets/product/${productId}?asset=${assetId}`:'');
      if(!publicUrl)throw new InternalServerErrorException('Görsel İçin Herkese Açık Depolama Adresi Tanımlanmalı');
      await this.db.transaction(async client=>{
        if(productId){
          const updated=await client.query('UPDATE products SET image_url=$1,updated_at=now() WHERE id=$2 RETURNING id',[publicUrl,productId]);
          if(!updated.rowCount)throw new NotFoundException('Ürün Bulunamadı');
        }
        await client.query("UPDATE assets SET status='READY' WHERE id=$1",[assetId]);
        await client.query('INSERT INTO asset_usages (asset_id,placement,created_at) VALUES ($1,$2,clock_timestamp())',[assetId,input.placement]);
      });
      return{assetId,storageKey:key,publicUrl,status:'READY'};
    }catch(error){
      await this.db.query("UPDATE assets SET status='FAILED' WHERE id=$1",[assetId]);
      if(error instanceof ServiceUnavailableException||error instanceof NotFoundException)throw error;
      throw new InternalServerErrorException('Görsel Kaydedilemedi. Depolama Bağlantısı Ve Ürün Kaydı Kontrol Edilmeli.');
    }
  }
}
