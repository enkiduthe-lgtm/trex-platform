import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { parseXML } from '@aws-sdk/xml-builder';
import { ShippingProvider, ShippingProviderInput, ShippingProviderResult } from './shipping-provider.interface';
type ArasResult = { code: string; message: string; trackingNumber: string | null };
/** Contract implementation for Aras Kargo's SetOrder SOAP service. */
@Injectable()
export class ArasShippingProvider implements ShippingProvider {
  async createShipment(input: ShippingProviderInput): Promise<ShippingProviderResult> {
    const customerCode = process.env.ARAS_CUSTOMER_CODE;
    const username = process.env.ARAS_SET_ORDER_USERNAME;
    const password = process.env.ARAS_SET_ORDER_PASSWORD;
    const endpoint = process.env.ARAS_SET_ORDER_ENDPOINT;
    if (!customerCode || !username || !password || !endpoint) {
      throw new ConflictException('Aras Kargo Bağlantı Ayarları Eksik');
    }
    const orderReference = this.limit(input.orderNumber, 16);
    // Aras validates this identifier strictly and rejects lowercase characters.
    // Keeping it deterministic also makes a retry for the same order idempotent.
    const integrationCode = this.limit(input.orderId.replaceAll('-', '').toUpperCase(), 32);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: '"http://tempuri.org/SetOrder"' },
      body: this.envelope({ username, password, orderReference, integrationCode, input }),
      signal: AbortSignal.timeout(15_000), redirect:'error',
    }).catch(() => { throw new ServiceUnavailableException('Aras Kargo Servisine Ulaşılamadı'); });
    const payload = await response.text();
    if (!response.ok) throw new ServiceUnavailableException(`Aras Kargo İsteği Başarısız (${response.status})`);
    const result = this.parse(payload);
    if (result.code !== '0') throw new ConflictException(`Aras Gönderi Kaydı Reddedildi: ${result.message || result.code}`);
    if(!await this.verifyRegisteredShipment(integrationCode,input.packageBarcode))throw new ConflictException('Aras Gönderi Kaydı Sorguda Bulunamadı');
    return {
      reference: integrationCode,
      trackingNumber: result.trackingNumber,
      payload: { customerCode, integrationCode, responseCode: result.code, responseMessage: result.message, registrationVerified:true, packageBarcode:input.packageBarcode },
    };
  }
  private envelope({ username, password, orderReference, integrationCode, input }: { username: string; password: string; orderReference: string; integrationCode: string; input: ShippingProviderInput }) {
    const isCod = ['cash_on_delivery_cash', 'cash_on_delivery_card'].includes(input.paymentProvider ?? '');
    const amount = Number(input.totalAmount);
    if (isCod && (input.currency !== 'TRY' || !Number.isFinite(amount) || amount <= 0)) {
      throw new ConflictException('Aras Kapıda Ödeme Tutarı Pozitif Ve TL Olmalıdır');
    }
    // SetOrder uses 0/1; tracking query responses use a separate 1/6 code table.
    const codFields = isCod ? `<IsCod>1</IsCod><CodAmount>${amount.toFixed(2)}</CodAmount><CodCollectionType>${input.paymentProvider === 'cash_on_delivery_card' ? '1' : '0'}</CodCollectionType><CodBillingType>0</CodBillingType>` : '<IsCod>0</IsCod>';
    const phone = input.phone.replace(/\D/g, '').slice(-10);
    // Aras branches process each package by PieceDetail.BarcodeNumber. This is
    // the same unique barcode printed on the physical TREX package label.
    const pieceBarcode = this.limit(input.packageBarcode || input.orderId.replace(/\D/g, '') || orderReference.replace(/\D/g, ''), 64);
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:tem="http://tempuri.org/"><soap:Body><SetOrder xmlns="http://tempuri.org/"><orderInfo><Order>
<UserName>${this.xml(username)}</UserName><Password>${this.xml(password)}</Password><TradingWaybillNumber>${this.xml(orderReference)}</TradingWaybillNumber>
<ReceiverName>${this.xml(this.limit(input.recipientName, 100))}</ReceiverName><ReceiverAddress>${this.xml(this.limit(input.addressLine, 250))}</ReceiverAddress><ReceiverPhone1>${this.xml(phone)}</ReceiverPhone1><ReceiverCityName>${this.xml(this.limit(input.city, 40))}</ReceiverCityName><ReceiverTownName>${this.xml(this.limit(input.district, 16))}</ReceiverTownName>
${codFields}<VolumetricWeight>1</VolumetricWeight><PieceCount>1</PieceCount><IntegrationCode>${this.xml(integrationCode)}</IntegrationCode><PayorTypeCode>1</PayorTypeCode><IsWorldWide>0</IsWorldWide>
<PieceDetails><PieceDetail><VolumetricWeight>1</VolumetricWeight><Weight>1</Weight><BarcodeNumber>${this.xml(pieceBarcode)}</BarcodeNumber><ProductNumber>${this.xml(input.orderNumber)}</ProductNumber><Description>Trex Tea Siparişi</Description></PieceDetail></PieceDetails>
</Order></orderInfo><userName>${this.xml(username)}</userName><password>${this.xml(password)}</password></SetOrder></soap:Body></soap:Envelope>`;
  }
  private parse(xml: string): ArasResult {
    const body=this.child(this.child(this.read(xml),'Envelope'),'Body');
    if(this.child(body,'Fault'))throw new ServiceUnavailableException('Aras Gönderi İşlemini Reddetti');
    const value=this.child(this.child(this.child(body,'SetOrderResponse'),'SetOrderResult'),'OrderResultInfo');
    const rows=Array.isArray(value)?value:value?[value]:[];
    if(rows.length!==1)throw new ServiceUnavailableException('Aras Gönderi Yanıtı Geçersiz');
    return {code:String(this.child(rows[0],'ResultCode')??'unknown'),message:String(this.child(rows[0],'ResultMessage')??''),trackingNumber:null};
  }
  private child(value:unknown,name:string):any{return value&&typeof value==='object'?Object.entries(value).find(([k])=>k.split(':').pop()===name)?.[1]:undefined;}
  private read(xml:string):unknown{if(xml.length>2000000||/<!DOCTYPE|<!ENTITY/i.test(xml))throw new ServiceUnavailableException('Aras Yanıtı Geçersiz');try{return parseXML(xml);}catch{throw new ServiceUnavailableException('Aras Yanıtı Okunamadı');}}
  async verifyRegisteredShipment(reference:string,barcode?:string|null):Promise<boolean>{
    const endpoint=process.env.ARAS_SET_ORDER_ENDPOINT,username=process.env.ARAS_SET_ORDER_USERNAME,password=process.env.ARAS_SET_ORDER_PASSWORD;
    if(!endpoint||!username||!password)throw new ConflictException('Aras Doğrulama Ayarları Eksik');
    let response:Response;
    try{response=await fetch(endpoint,{method:'POST',headers:{'content-type':'text/xml; charset=utf-8',SOAPAction:'"http://tempuri.org/GetOrderWithIntegrationCode"'},body:`<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetOrderWithIntegrationCode xmlns="http://tempuri.org/"><userName>${this.xml(username)}</userName><password>${this.xml(password)}</password><integrationCode>${this.xml(reference)}</integrationCode></GetOrderWithIntegrationCode></s:Body></s:Envelope>`,signal:AbortSignal.timeout(15000),redirect:'error'});}catch{throw new ServiceUnavailableException('Aras Kayıt Doğrulama Servisine Ulaşılamadı');}
    if(!response.ok)throw new ServiceUnavailableException('Aras Kayıt Doğrulama Başarısız');
    const body=this.child(this.child(this.read(await response.text()),'Envelope'),'Body');
    if(this.child(body,'Fault'))throw new ServiceUnavailableException('Aras Kayıt Sorgusunu Reddetti');
    const result=this.child(this.child(body,'GetOrderWithIntegrationCodeResponse'),'GetOrderWithIntegrationCodeResult');
    if(result===undefined)throw new ServiceUnavailableException('Aras Kayıt Sorgu Yanıtı Geçersiz');
    const value=this.child(result,'Order'),rows=Array.isArray(value)?value:value?[value]:[];
    if(!rows.length)return false;
    if(rows.length!==1||String(this.child(rows[0],'IntegrationCode'))!==reference)throw new ConflictException('Aras Entegrasyon Kodu Eşleşmiyor');
    const detail=this.child(this.child(rows[0],'PieceDetails'),'PieceDetail'),pieces=Array.isArray(detail)?detail:detail?[detail]:[];
    if(barcode&&!pieces.some(piece=>String(this.child(piece,'BarcodeNumber'))===barcode))throw new ConflictException('Aras Paket Barkodu Eşleşmiyor');
    return true;
  }
  private xml(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
  private decode(value: string) { return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }
  private limit(value: string, max: number) { return value.trim().slice(0, max); }
}
