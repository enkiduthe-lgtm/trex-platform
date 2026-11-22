import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Job, Worker } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { normalizeRedisUrl } from '../config/environment';
import { DEFAULT_QUEUE } from '../jobs/jobs.constants';
import { BrevoEmailProvider } from './brevo-email.provider';
import { NotificationsService } from './notifications.service';
import { NotificationDeliveryError } from './notification-delivery-error';

type DispatchRecord={channel:string;recipient:string;subject:string|null;body:string;delivery_mode:string|null};

@Injectable()
export class NotificationOutboxService implements OnModuleInit,OnModuleDestroy {
  private worker?:Worker;
  private timer?:NodeJS.Timeout;
  private closed=false;
  private readonly logger=new Logger(NotificationOutboxService.name);
  constructor(private readonly db:DatabaseService,private readonly config:ConfigService,private readonly brevo:BrevoEmailProvider,@Optional() private readonly notifications?:NotificationsService){}
  onModuleInit(){
    this.closed=false;
    this.worker=new Worker(DEFAULT_QUEUE,async(job:Job<{notificationId:string}>)=>{
      if(job.name!=='notification.dispatch')return;
      return this.dispatch(job.data.notificationId);
    },{connection:{url:normalizeRedisUrl(this.config.getOrThrow<string>('REDIS_URL'))}});
    this.worker.on('error',()=>this.logger.warn('Bildirim işleyicisi bağlantısı kullanılamıyor'));
    if(this.notifications){
      this.timer=setInterval(()=>{void this.pump();},30_000);this.timer.unref();void this.pump();
    }
  }
  private async pump(){
    if(this.closed)return;
    try{await this.notifications?.pumpPending();}catch{this.logger.warn('Bekleyen bildirim kontrolü tamamlanamadı');}
  }
  async dispatch(id:string){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return {claimed:false};
    const token=randomUUID();
    let row:DispatchRecord|undefined;
    try{
      row=(await this.db.query<DispatchRecord>("UPDATE notifications SET status='RETRYING',attempt_count=attempt_count+1,last_attempt_at=now(),delivery_started_at=now(),delivery_token=$2,failure_reason=NULL WHERE id=$1 AND status='PENDING' RETURNING channel,recipient,subject,body,delivery_mode",[id,token])).rows[0];
    }catch{throw new Error('Bildirim kaydı işleme alınamadı');}
    if(!row)return {claimed:false};
    try{
      let reference:string;
      if(row.channel==='IN_APP'&&row.delivery_mode!=='MOCK')reference='internal_notification_'+randomUUID();
      else if(row.delivery_mode==='MOCK'){
        if(process.env.NODE_ENV==='production')throw new NotificationDeliveryError('Test bildirimi canlı iletim olarak gönderilemez.',false);
        reference='mock_notification_'+randomUUID();
      }else if(row.channel==='EMAIL'&&row.delivery_mode==='BREVO'&&process.env.NOTIFICATION_PROVIDER==='brevo'){
        const delivery=await this.brevo.send({recipient:row.recipient,subject:row.subject??'TREX bildirimi',body:row.body,idempotencyKey:token});
        if(!delivery?.providerReference)throw new NotificationDeliveryError('Sağlayıcı iletim numarası doğrulanamadı.',true);
        reference=delivery.providerReference;
      }else throw new NotificationDeliveryError('Kaydın sağlayıcı bağlantısı doğrulanamadı. İletim başlatılmadı.',row.delivery_mode===null);
      await this.finish(id,token,'SENT',reference,null);
      return {claimed:true,status:'SENT'};
    }catch(error){
      const known=error instanceof NotificationDeliveryError;
      const status=!known||error.uncertain?'UNKNOWN':'FAILED';
      const reason=known?error.message:'İletim sonucu doğrulanamadı. Tekrar göndermeden sağlayıcı kaydını kontrol edin.';
      try{await this.finish(id,token,status,null,reason);}catch{throw new Error('Bildirim sonucu kaydedilemedi');}
      return {claimed:true,status};
    }
  }
  private async finish(id:string,token:string,status:string,reference:string|null,reason:string|null){
    await this.db.query("UPDATE notifications SET status=$3::notification_status,provider_reference=$4,sent_at=CASE WHEN $3::text='SENT' THEN now() ELSE NULL END,failure_reason=$5,next_attempt_at=NULL WHERE id=$1 AND delivery_token=$2 AND status IN ('RETRYING','UNKNOWN')",[id,token,status,reference,reason]);
  }
  async onModuleDestroy(){this.closed=true;if(this.timer)clearInterval(this.timer);await this.worker?.close();}
}
