import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NotificationDeliveryError } from './notification-delivery-error';
type BrevoResponse={messageId?:unknown;code?:unknown};

@Injectable()
export class BrevoEmailProvider {
  async send(input: { recipient: string; subject: string; body: string; idempotencyKey?:string }) {
    const apiKey = process.env.BREVO_API_KEY;
    const from = process.env.BREVO_FROM_EMAIL;
    if (!apiKey || !from) throw new NotificationDeliveryError('E-posta sağlayıcısı ayarları eksik',false);
    let response:Response;
    try{
      response=await fetch('https://api.brevo.com/v3/smtp/email', {
        method:'POST',redirect:'error',signal:AbortSignal.timeout(20_000),
        headers:{'api-key':apiKey,'content-type':'application/json'},
        body:JSON.stringify({sender:{email:from},to:[{email:input.recipient}],subject:input.subject,textContent:input.body,headers:{idempotencyKey:input.idempotencyKey??randomUUID()}}),
      });
    }catch{throw new NotificationDeliveryError('E-posta sağlayıcısının yanıtı doğrulanamadı. Yeniden göndermeden sağlayıcı kaydını kontrol edin.',true);}
    let result:BrevoResponse|null=null;
    try{const body:unknown=await response.json();if(body&&typeof body==='object')result=body as BrevoResponse;}catch{/* HTTP status still distinguishes a definite rejection. */}
    if(!response.ok){
      const uncertain=response.status>=500||response.status===408||result?.code==='duplicate_parameter';
      throw new NotificationDeliveryError(uncertain?'E-posta gönderim sonucu belirsiz. Sağlayıcı kaydı kontrol edilmeli.':`E-posta sağlayıcısı isteği reddetti (HTTP ${response.status}).`,uncertain);
    }
    if(typeof result?.messageId!=='string'||!result.messageId)throw new NotificationDeliveryError('E-posta sağlayıcısı gönderim numarası bildirmedi. Sonuç kontrol edilmeli.',true);
    return { providerReference: result.messageId };
  }
}
