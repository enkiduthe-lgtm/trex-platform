import { ForbiddenException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { RequestUser } from '../auth/auth.types';
import { ArasQueryProvider } from './aras-query.provider';
import { ShippingService } from './shipping.service';

const jobName='trex.aras.tracking';
type Shipment={id:string;order_id:string;provider_reference:string};
@Injectable()
export class ArasTrackingService implements OnModuleInit,OnModuleDestroy {
  private timer?:NodeJS.Timeout;
  private running=false;
  private stopped=false;
  private readonly logger=new Logger(ArasTrackingService.name);
  constructor(private readonly db:DatabaseService,private readonly query:ArasQueryProvider,private readonly shipping:ShippingService){}
  onModuleInit(){
    this.stopped=false;
    if(process.env.ARAS_TRACKING_ENABLED!=='true'||!this.query.configured())return;
    this.timer=setInterval(()=>{void this.sync().catch(()=>this.logger.warn('Aras Otomatik Takip Kontrolü Tamamlanamadı'));},300_000);
    this.timer.unref();void this.sync().catch(()=>this.logger.warn('Aras İlk Takip Kontrolü Tamamlanamadı'));
  }
  onModuleDestroy(){this.stopped=true;if(this.timer)clearInterval(this.timer);}
  async sync(orderId?:string,actor?:RequestUser){
    if(actor&&actor.role!=='SUPER_ADMIN')throw new ForbiddenException('Aras Kontrolünü Yalnız Müdür Başlatabilir');
    if(!this.query.configured())return {configured:false,checked:0,updated:0,failed:0};
    if(this.running||this.stopped)return {busy:true,checked:0,updated:0,failed:0};
    this.running=true;const token=randomUUID();let acquired=false,checked=0,updated=0,failed=0;
    try{
      // Release the connection before carrier I/O. An expiring lease excludes
      // other instances without keeping an idle database transaction open.
      const lease=await this.db.query<{owner_token:string}>([
        "INSERT INTO background_job_leases(name,owner_token,lease_until) VALUES($1,$2,clock_timestamp()+interval '90 seconds')",
        'ON CONFLICT(name) DO UPDATE SET owner_token=EXCLUDED.owner_token,lease_until=EXCLUDED.lease_until',
        'WHERE background_job_leases.lease_until<=clock_timestamp() RETURNING owner_token',
      ].join(' '),[jobName,token]);
      acquired=lease.rows[0]?.owner_token===token;
      if(!acquired)return {busy:true,checked,updated,failed};
      const rows=await this.db.query<Shipment>([
        'SELECT s.id,s.order_id,s.provider_reference FROM shipments s JOIN orders o ON o.id=s.order_id',
        "WHERE s.provider='aras' AND s.status IN ('CREATED','IN_TRANSIT','FAILED') AND s.tracking_direction_code IS DISTINCT FROM '3'",
        "AND o.archived_at IS NULL AND o.status IN ('PROCESSING','SHIPPED') AND s.provider_reference IS NOT NULL",
        'AND ($1::uuid IS NULL OR s.order_id=$1)',
        "AND ($1::uuid IS NOT NULL OR s.tracking_checked_at IS NULL OR s.tracking_checked_at<now()-interval '5 minutes')",
        'ORDER BY s.tracking_checked_at NULLS FIRST,s.created_at,s.id LIMIT 20',
      ].join(' '),[orderId??null]);
      for(const row of rows.rows){
        if(!await this.renew(token))return {busy:true,configured:true,checked,updated,failed};
        checked++;
        try{
          const observation=await this.query.query(row.provider_reference);
          if(!await this.renew(token))return {busy:true,configured:true,checked,updated,failed};
          if(!observation){await this.recordQueryResult(row,'Aras Henüz Gönderi Hareketi Bildirmedi',token);continue;}
          const eventId='aras:'+createHash('sha256').update(JSON.stringify([observation.reference,observation.code,observation.direction])).digest('hex');
          await this.shipping.updateStatus(row.order_id,{status:observation.status,description:observation.description},actor?.id??null,{
            reference:observation.reference,eventId,code:observation.code,direction:observation.direction,trackingNumber:observation.trackingNumber,leaseToken:token,
          });
          updated++;
        }catch{
          if(!await this.renew(token))return {busy:true,configured:true,checked,updated,failed};
          failed++;
          await this.recordQueryResult(row,'Aras Kontrolü Tamamlanamadı; Son Kayıtlı Durumu Kontrol Edin',token).catch(()=>this.logger.warn('Aras Takip Kontrol Sonucu Kaydedilemedi'));
        }
      }
      return {configured:true,checked,updated,failed};
    }finally{
      if(acquired)await this.db.query('DELETE FROM background_job_leases WHERE name=$1 AND owner_token=$2',[jobName,token]).catch(()=>this.logger.warn('Aras Takip Çalışma Kilidi Serbest Bırakılamadı'));
      this.running=false;
    }
  }
  private async renew(token:string){
    if(this.stopped)return false;
    const result=await this.db.query<{name:string}>("UPDATE background_job_leases SET lease_until=clock_timestamp()+interval '90 seconds' WHERE name=$1 AND owner_token=$2 AND lease_until>clock_timestamp() RETURNING name",[jobName,token]);
    return result.rows.length===1;
  }
  private async recordQueryResult(row:Shipment,message:string,token:string){
    await this.db.query([
      'UPDATE shipments SET tracking_checked_at=now(),tracking_error=$3',
      "WHERE id=$1 AND provider='aras' AND provider_reference=$2",
      "AND status IN ('CREATED','IN_TRANSIT','FAILED') AND tracking_direction_code IS DISTINCT FROM '3'",
      "AND EXISTS(SELECT 1 FROM orders o WHERE o.id=shipments.order_id AND o.archived_at IS NULL AND o.status IN ('PROCESSING','SHIPPED'))",
      'AND EXISTS(SELECT 1 FROM background_job_leases l WHERE l.name=$4 AND l.owner_token=$5 AND l.lease_until>clock_timestamp())',
    ].join(' '),[row.id,row.provider_reference,message,jobName,token]);
  }
}
