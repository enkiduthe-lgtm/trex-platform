import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseXML } from '@aws-sdk/xml-builder';

export type ArasObservation = {
  reference: string; code: string; direction: string; trackingNumber: string | null;
  status: 'IN_TRANSIT' | 'DELIVERED' | 'FAILED'; description: string;
};
const endpoint = 'https://customerservices.araskargo.com.tr/ArasCargoCustomerIntegrationService/ArasCargoIntegrationService.svc';
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const key = (s: string) => s.replace(/_x([0-9a-f]{4})_/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16))).split(':').pop()!.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').toUpperCase().replace(/[^A-Z0-9]/g, '');
const field = (row: Record<string, unknown>, ...names: string[]) => {
  const entry = Object.entries(row).find(([k]) => names.includes(key(k)));
  return typeof entry?.[1] === 'string' || typeof entry?.[1] === 'number' ? String(entry[1]).trim() : '';
};

/** Aras official GetQueryDS contract and QueryType=1 reference lookup. */
@Injectable()
export class ArasQueryProvider {
  configured() { return Boolean(process.env.ARAS_QUERY_USERNAME && process.env.ARAS_QUERY_PASSWORD && process.env.ARAS_CUSTOMER_CODE); }
  async query(reference: string): Promise<ArasObservation | null> {
    if (!this.configured()) throw new ServiceUnavailableException('Aras Sorgulama Üyeliği Ayarları Eksik');
    if (!reference || reference.length > 100) throw new ServiceUnavailableException('Aras Referansı Geçersiz');
    const login = `<LoginInfo><UserName>${xml(process.env.ARAS_QUERY_USERNAME!)}</UserName><Password>${xml(process.env.ARAS_QUERY_PASSWORD!)}</Password><CustomerCode>${xml(process.env.ARAS_CUSTOMER_CODE!)}</CustomerCode></LoginInfo>`;
    const info = `<QueryInfo><QueryType>1</QueryType><IntegrationCode>${xml(reference)}</IntegrationCode></QueryInfo>`;
    let response: Response;
    try {
      response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: '"http://tempuri.org/IArasCargoIntegrationService/GetQueryDS"' }, body: `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetQueryDS xmlns="http://tempuri.org/"><loginInfo>${xml(login)}</loginInfo><queryInfo>${xml(info)}</queryInfo></GetQueryDS></s:Body></s:Envelope>`, signal: AbortSignal.timeout(15000), redirect: 'error' });
    } catch { throw new ServiceUnavailableException('Aras Sorgulama Servisine Ulaşılamadı'); }
    if (!response.ok) throw new ServiceUnavailableException('Aras Sorgulama Servisi Yanıt Vermedi');
    const body = await response.text();
    return this.parse(body, reference);
  }
  parse(body: string, reference: string): ArasObservation | null {
    if (body.length > 2_000_000 || /<!DOCTYPE|<!ENTITY/i.test(body)) throw new ServiceUnavailableException('Aras Yanıtı Doğrulanamadı');
    let root: unknown;
    try { root = parseXML(body); } catch { throw new ServiceUnavailableException('Aras Yanıtı Okunamadı'); }
    const child = (value: unknown, name: string): unknown => value && typeof value === 'object' ? Object.entries(value).find(([k]) => key(k) === name)?.[1] : undefined;
    const envelope = child(root, 'ENVELOPE');
    const soap = child(envelope, 'BODY');
    if (child(soap, 'FAULT')) throw new ServiceUnavailableException('Aras Sorgulama İşlemi Reddedildi');
    const result = child(child(soap, 'GETQUERYDSRESPONSE'), 'GETQUERYDSRESULT');
    if (!result || typeof result !== 'object') throw new ServiceUnavailableException('Aras Sorgu Sonucu Bulunamadı');
    const rows: Record<string, unknown>[] = [];
    const walk = (node: unknown, depth = 0) => {
      if (depth > 20) throw new ServiceUnavailableException('Aras Yanıtı Doğrulanamadı');
      if (!node || typeof node !== 'object') return;
      if (field(node as Record<string, unknown>, 'MUSTERIOZELKODU', 'INTEGRATIONCODE')) rows.push(node as Record<string, unknown>);
      else for (const [name, value] of Object.entries(node)) if (key(name) !== 'SCHEMA') walk(value, depth + 1);
    };
    walk(result);
    if (!rows.length) return null;
    if (rows.length !== 1 || field(rows[0], 'MUSTERIOZELKODU', 'INTEGRATIONCODE') !== reference) throw new ServiceUnavailableException('Aras Gönderi Referansı Eşleşmiyor');
    const row = rows[0], code = field(row, 'DURUMKODU'), direction = field(row, 'TIPKODU');
    // Unknown direction, partial delivery, or an absent code never confirms a delivery.
    if (!['1', '2', '3'].includes(direction) || !['1', '2', '3', '4', '5', '6', '7'].includes(code)) throw new ServiceUnavailableException('Aras Durum Kodu Doğrulanamadı');
    const status = direction === '3' ? 'FAILED' : code === '6' ? 'DELIVERED' : 'IN_TRANSIT';
    const descriptions: Record<string, string> = { '1': 'Çıkış Şubesinde', '2': 'Yolda', '3': 'Teslimat Şubesinde', '4': 'Teslimatta', '5': 'Parçalı Teslimat', '6': 'Teslim Edildi', '7': 'Yönlendirildi' };
    return { reference, code, direction, status, trackingNumber: /^[0-9A-Za-z-]{1,64}$/.test(field(row, 'KARGOTAKIPNO')) ? field(row, 'KARGOTAKIPNO') : null, description: direction === '3' ? 'Aras Kargo İade Olarak Bildirdi' : `Aras: ${descriptions[code]}` };
  }
}
