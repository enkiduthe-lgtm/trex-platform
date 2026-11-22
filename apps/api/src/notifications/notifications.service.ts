import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { isEmail } from 'class-validator';
import { DatabaseService } from '../database/database.service';
import { CreateNotificationDto, NotificationChannel } from './dto/create-notification.dto';
import { NotificationHistoryQueryDto } from './dto/notification-history-query.dto';
import { assertMockIntegrationAllowed } from '../config/mock-integration-policy';
import { JobsService } from '../jobs/jobs.service';
type DeliveryMode='IN_APP'|'MOCK'|'BREVO';
type NotificationRow={id:string;channel:NotificationChannel;status:string;delivery_mode:DeliveryMode|null;provider_reference?:string|null;is_simulated?:boolean;is_sensitive?:boolean;attempt_count?:number};
type RequestInfo={actorId:string;key?:string};
const sensitiveRecord="COALESCE(template_code='PASSWORD_RESET' OR concat_ws(' ',subject,body) ILIKE '%/sifre-sifirla?token=%',false)";
const publicSubject=`CASE WHEN ${sensitiveRecord} THEN 'Hesap güvenliği bildirimi' ELSE subject END`;
const publicBody=`CASE WHEN ${sensitiveRecord} THEN 'Hesap güvenliği bildiriminin içeriği gizlidir.' ELSE body END`;
const columns=`id,channel,recipient,${publicSubject} AS subject,${publicBody} AS body,status,sent_at,created_at,attempt_count,last_attempt_at,next_attempt_at,CASE WHEN ${sensitiveRecord} THEN NULL ELSE failure_reason END AS failure_reason,delivery_mode,${sensitiveRecord} AS is_sensitive,COALESCE(delivery_mode='MOCK' OR starts_with(provider_reference,'mock_notification_'),false) AS is_simulated`;
@Injectable()
export class NotificationsService {
  private pumping=false;
  constructor(private readonly db: DatabaseService, private readonly jobs?: JobsService) {}
  configuration(){
    const provider=process.env.NOTIFICATION_PROVIDER??'mock';
    const simulated=provider==='mock'&&process.env.NODE_ENV!=='production';
    const emailReady=provider==='brevo'&&Boolean(process.env.BREVO_API_KEY&&process.env.BREVO_FROM_EMAIL);
    return {provider:['mock','brevo'].includes(provider)?provider:'unconfigured',simulated,queueConfigured:Boolean(this.jobs),channels:[
      {channel:NotificationChannel.IN_APP,available:true,reason:'Uygulama içinde kayıt oluşturur.'},
      {channel:NotificationChannel.EMAIL,available:simulated||emailReady,reason:simulated?'Test kaydı; gerçek e-posta gönderilmez.':emailReady?'Canlı e-posta bağlantı bilgileri kayıtlı.':'E-posta bağlantı bilgileri hazır değil.'},
      {channel:NotificationChannel.SMS,available:simulated,reason:simulated?'Test kaydı; gerçek SMS gönderilmez.':'SMS sağlayıcısı bağlı değil.'},
      {channel:NotificationChannel.PUSH,available:simulated,reason:simulated?'Test kaydı; gerçek push bildirimi gönderilmez.':'Push sağlayıcısı bağlı değil.'},
    ]};
  }
  private mode(channel:NotificationChannel):DeliveryMode {
    if(channel===NotificationChannel.IN_APP)return 'IN_APP';
    const config=this.configuration();
    if(!config.channels.find(item=>item.channel===channel)?.available)throw new ServiceUnavailableException('Seçilen bildirim kanalının bağlantısı hazır değil.');
    return config.simulated?'MOCK':'BREVO';
  }
  private decorate<T extends NotificationRow>(row:T){
    const mode=row.delivery_mode??(row.channel===NotificationChannel.IN_APP?'IN_APP':null),config=this.configuration();
    const canRetry=!row.is_sensitive&&['FAILED','UNKNOWN'].includes(row.status)&&(
      mode==='IN_APP'&&row.channel===NotificationChannel.IN_APP||
      mode==='MOCK'&&config.simulated||
      mode==='BREVO'&&row.status==='FAILED'&&row.channel===NotificationChannel.EMAIL&&config.provider==='brevo'&&Boolean(config.channels.find(item=>item.channel===NotificationChannel.EMAIL)?.available)
    );
    return {...row,delivery_mode:mode,is_simulated:mode==='MOCK'||Boolean(row.is_simulated),can_retry:canRetry,needs_review:row.status==='UNKNOWN'||mode===null};
  }
  private async enqueue(id:string):Promise<boolean>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const row=(await this.db.query<NotificationRow>('SELECT id,channel,status,delivery_mode,attempt_count FROM notifications WHERE id=$1',[id])).rows[0];
      if(!row||row.status!=='PENDING')return false;
      if(row.channel===NotificationChannel.IN_APP&&row.delivery_mode!=='MOCK'){
        await this.db.query("UPDATE notifications SET status='SENT',delivery_mode='IN_APP',sent_at=now(),failure_reason=NULL,next_attempt_at=NULL WHERE id=$1 AND status='PENDING'",[id]);return true;
      }
      if(row.delivery_mode!=='BREVO'||row.channel!==NotificationChannel.EMAIL){
        await this.db.query("UPDATE notifications SET status='UNKNOWN',failure_reason='Kaydın iletim türü doğrulanamadı; tekrar göndermeden önce kontrol edin.',next_attempt_at=NULL WHERE id=$1 AND status='PENDING'",[id]);return false;
      }
      if(!this.jobs||!this.configuration().channels.find(item=>item.channel===NotificationChannel.EMAIL)?.available||this.configuration().provider!=='brevo')throw new Error('Queue unavailable');
      await Promise.race([
        this.jobs.enqueue('notification.dispatch',{notificationId:id},`notification-${id}-${(row.attempt_count??0)+1}`),
        new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Queue timeout')),4000);}),
      ]);
      await this.db.query("UPDATE notifications SET failure_reason=NULL,next_attempt_at=now()+interval '30 seconds' WHERE id=$1 AND status='PENDING'",[id]);return true;
    }catch{
      await this.db.query("UPDATE notifications SET failure_reason='İletim kuyruğuna henüz ulaşılamadı; kayıt korunuyor ve yeniden kontrol edilecek.',next_attempt_at=now()+interval '30 seconds' WHERE id=$1 AND status='PENDING'",[id]).catch(()=>{});return false;
    }finally{if(timer)clearTimeout(timer);}
  }
  async sendMock(dto:CreateNotificationDto,userId?:string){assertMockIntegrationAllowed('NOTIFICATION_PROVIDER');return this.createRecord(dto,userId,undefined,true);}
  async send(dto:CreateNotificationDto,userId?:string,request?:RequestInfo){return this.createRecord(dto,userId,request);}
  private async createRecord(dto:CreateNotificationDto,userId?:string,request?:RequestInfo,forceMock=false){
    const recipient=dto.recipient.trim(),body=dto.body.trim(),subject=dto.subject?.trim()||null;
    if(!Object.values(NotificationChannel).includes(dto.channel)||!recipient||!body)throw new BadRequestException('Kanal, alıcı ve mesaj alanlarını kontrol edin.');
    if(dto.channel===NotificationChannel.EMAIL&&!isEmail(recipient))throw new BadRequestException('Geçerli bir e-posta alıcısı girin.');
    if(request?.key!==undefined&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.key))throw new BadRequestException('Geçerli bildirim işlem anahtarı gerekli');
    const identity=request?.key?`notification-create:${request.actorId}:${request.key.toLowerCase()}`:null;
    const hash=identity?createHash('sha256').update(JSON.stringify({channel:dto.channel,recipient,subject,body,userId:userId??null})).digest('hex'):null;
    const saved=await this.db.transaction(async client=>{
      if(identity){
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[identity]);
        const prior=(await client.query<{request_hash:string;resource_type:string;resource_id:string|null}>('SELECT request_hash,resource_type,resource_id FROM idempotency_records WHERE key=$1',[identity])).rows[0];
        if(prior){
          if(prior.request_hash!==hash||prior.resource_type!=='notification'||!prior.resource_id)throw new ConflictException('Bu işlem anahtarı farklı bir bildirimde kullanılmış');
          const old=(await client.query<NotificationRow>('SELECT id,channel,status,delivery_mode,provider_reference FROM notifications WHERE id=$1',[prior.resource_id])).rows[0];
          if(!old)throw new ConflictException('Önceki bildirim bulunamadı. Yeni kayıt oluşturmadan geçmişi kontrol edin.');
          return {...old,replayed:true};
        }
      }
      const mode=forceMock?'MOCK':this.mode(dto.channel),status=mode==='BREVO'?'PENDING':'SENT';
      const reference=mode==='MOCK'?`mock_notification_${randomUUID()}`:mode==='IN_APP'?`internal_notification_${randomUUID()}`:null;
      const templateCode=/\/sifre-sifirla\?token=/i.test(`${subject??''} ${body}`)?'PASSWORD_RESET':null;
      const row=(await client.query<NotificationRow>(`INSERT INTO notifications(user_id,created_by,channel,recipient,subject,body,status,delivery_mode,provider_reference,sent_at,next_attempt_at,template_code)
        VALUES($1,$2,$3,$4,$5,$6,$7::notification_status,$8,$9,CASE WHEN $7::text='SENT' THEN now() ELSE NULL END,CASE WHEN $7::text='PENDING' THEN now() ELSE NULL END,$10)
        RETURNING id,channel,status,delivery_mode,provider_reference`,[userId??null,request?.actorId??null,dto.channel,recipient,subject,body,status,mode,reference,templateCode])).rows[0];
      if(request?.actorId)await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[request.actorId,'notification.created','notification',row.id,JSON.stringify({channel:dto.channel,mode})]);
      if(identity)await client.query("INSERT INTO idempotency_records(key,request_hash,resource_type,resource_id,expires_at) VALUES($1,$2,'notification',$3,now()+interval '365 days')",[identity,hash,row.id]);
      return {...row,replayed:false};
    });
    const queued=saved.status==='PENDING'?await this.enqueue(saved.id):false;
    return {id:saved.id,status:saved.status,mode:saved.delivery_mode,simulated:saved.delivery_mode==='MOCK',queueState:saved.status==='PENDING'?(queued?'QUEUED':'WAITING'):'NOT_NEEDED',replayed:saved.replayed};
  }
  async list(){return (await this.db.query<NotificationRow>(`SELECT ${columns} FROM notifications ORDER BY created_at DESC,id DESC LIMIT 100`)).rows.map(row=>this.decorate(row));}
  async history(query:NotificationHistoryQueryDto){
    const channel=query.channel??null,status=query.status??null,text=query.q?.trim()||null;
    if(channel&&!Object.values(NotificationChannel).includes(channel)||status&&!['PENDING','RETRYING','SENT','FAILED','UNKNOWN'].includes(status)||text&&text.length>200||query.before&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.before))throw new BadRequestException('Geçerli bildirim filtreleri seçin.');
    const term=text?`%${text.replace(/[\\%_]/g,'\\$&')}%`:null;
    return this.db.transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      if(query.before&&!(await client.query('SELECT id FROM notifications WHERE id=$1',[query.before])).rowCount)throw new BadRequestException('Bildirim sayfası başlangıcı bulunamadı. Listeyi yenileyin.');
      const filter=`($1::notification_channel IS NULL OR channel=$1) AND ($2::notification_status IS NULL OR status=$2) AND ($3::text IS NULL OR concat_ws(' ',recipient,${publicSubject},${publicBody}) ILIKE $3)`;
      const counts=(await client.query<{total:number;sent:number;pending:number;failed:number;unknown:number}>("SELECT count(*)::int total,count(*) FILTER(WHERE status='SENT')::int sent,count(*) FILTER(WHERE status IN ('PENDING','RETRYING'))::int pending,count(*) FILTER(WHERE status='FAILED')::int failed,count(*) FILTER(WHERE status='UNKNOWN')::int unknown FROM notifications")).rows[0];
      const matched=(await client.query<{count:number}>(`SELECT count(*)::int count FROM notifications WHERE ${filter}`,[channel,status,term])).rows[0].count;
      const result=await client.query<NotificationRow>(`SELECT ${columns} FROM notifications WHERE ${filter} AND ($4::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM notifications WHERE id=$4)) ORDER BY created_at DESC,id DESC LIMIT 101`,[channel,status,term,query.before??null]);
      const rows=result.rows.slice(0,100);return {rows:rows.map(row=>this.decorate(row)),next:result.rows.length>100?rows.at(-1)?.id??null:null,counts,matchedCount:matched,filters:{channel:channel??'',status:status??'',q:text??''}};
    });
  }
  async retry(id:string,actorId?:string){
    const result=await this.db.transaction(async client=>{
      const row=(await client.query<NotificationRow>(`SELECT id,channel,status,delivery_mode,${sensitiveRecord} AS is_sensitive FROM notifications WHERE id=$1 FOR UPDATE`,[id])).rows[0];
      if(!row||!['FAILED','UNKNOWN'].includes(row.status))return null;
      const record=this.decorate(row);if(!record.can_retry)throw new BadRequestException('Bu kaydın iletim sonucu veya kanalı doğrulanmadan tekrar gönderilemez.');
      const immediate=record.delivery_mode!=='BREVO',status=immediate?'SENT':'PENDING';
      const reference=record.delivery_mode==='MOCK'?`mock_notification_${randomUUID()}`:record.delivery_mode==='IN_APP'?`internal_notification_${randomUUID()}`:null;
      await client.query(`UPDATE notifications SET status=$2::notification_status,failure_reason=NULL,next_attempt_at=CASE WHEN $2::text='PENDING' THEN now() ELSE NULL END,sent_at=CASE WHEN $2::text='SENT' THEN now() ELSE NULL END,provider_reference=$3,delivery_token=NULL,delivery_started_at=NULL,attempt_count=attempt_count+CASE WHEN $2::text='SENT' THEN 1 ELSE 0 END WHERE id=$1`,[id,status,reference]);
      if(actorId)await client.query('INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',[actorId,'notification.retried','notification',id,JSON.stringify({channel:row.channel})]);
      return {id,status};
    });
    if(!result)return null;
    const queued=result.status==='PENDING'?await this.enqueue(id):false;return {...result,queued};
  }
  async pumpPending(){
    if(this.pumping)return {busy:true,checked:0};this.pumping=true;
    try{
      await this.db.query("UPDATE notifications SET status='UNKNOWN',failure_reason='İletim sonucu doğrulanamadı. Tekrar göndermeden önce sağlayıcı kaydını kontrol edin.',next_attempt_at=NULL WHERE status='RETRYING' AND COALESCE(delivery_started_at,last_attempt_at,created_at)<now()-interval '5 minutes'");
      const rows=(await this.db.query<{id:string}>("SELECT id FROM notifications WHERE status='PENDING' AND COALESCE(next_attempt_at,created_at)<=now() ORDER BY created_at,id LIMIT 20")).rows;
      for(let index=0;index<rows.length;index+=5)await Promise.all(rows.slice(index,index+5).map(row=>this.enqueue(row.id)));
      return {checked:rows.length};
    }finally{this.pumping=false;}
  }
  async recordOrderStatus(recipient: string | null, orderNumber: string, status: 'SHIPPED' | 'DELIVERED' | 'DELIVERY_EXCEPTION', client: { query: (sql: string, values: string[]) => Promise<unknown> } = this.db) {
    if (!recipient) return;
    const copy = status === 'SHIPPED'
      ? { subject: 'Siparişiniz kargoya verildi', body: `Siparişiniz kargoya verildi. Sipariş no: ${orderNumber}.` }
      : status === 'DELIVERED'
        ? { subject: 'Siparişiniz teslim edildi', body: `Siparişiniz teslim edildi. Sipariş no: ${orderNumber}.` }
        : { subject: 'Siparişinizin teslimatında sorun var', body: `Siparişinizin teslimatında bir sorun bildirildi. Sipariş no: ${orderNumber}. Lütfen destek ekibiyle iletişime geçin.` };
    await client.query(
      "INSERT INTO notifications (channel,recipient,template_code,subject,body,status,provider_reference,sent_at) VALUES ('IN_APP',$1,'ORDER_STATUS',$2,$3,'SENT',$4,now())",
      [recipient, copy.subject, copy.body, `system_order_${status.toLowerCase()}_${orderNumber}`],
    );
  }
}
