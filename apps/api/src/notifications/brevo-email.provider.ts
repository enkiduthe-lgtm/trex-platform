import { Injectable, ServiceUnavailableException } from '@nestjs/common';

@Injectable()
export class BrevoEmailProvider {
  async send(input: { recipient: string; subject: string; body: string }) {
    const apiKey = process.env.BREVO_API_KEY;
    const from = process.env.BREVO_FROM_EMAIL;
    if (!apiKey || !from) throw new ServiceUnavailableException('E-posta sağlayıcısı ayarları eksik');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ sender: { email: from }, to: [{ email: input.recipient }], subject: input.subject, textContent: input.body }),
    });
    const result = await response.json().catch(() => ({})) as { messageId?: string; message?: string };
    if (!response.ok || !result.messageId) throw new ServiceUnavailableException(`E-posta gönderilemedi: ${result.message ?? 'sağlayıcı hatası'}`);
    return { providerReference: result.messageId };
  }
}
