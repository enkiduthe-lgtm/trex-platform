import {ArasShippingProvider} from './aras-shipping.provider';
describe('Aras registration verification',()=>{
 const saved=process.env;const mock=jest.fn();
 const input={orderId:'abc-def',orderNumber:'2026-1',recipientName:'Test',phone:'05000000000',city:'BURSA',district:'NİLÜFER',addressLine:'Test',packageBarcode:'PKG-1'};
 const success='<s:Envelope><s:Body><SetOrderResponse><SetOrderResult><OrderResultInfo><ResultCode>0</ResultCode><ResultMessage>OK</ResultMessage></OrderResultInfo></SetOrderResult></SetOrderResponse></s:Body></s:Envelope>';
 const found=(ref='ABCDEF',barcode='PKG-1')=>`<s:Envelope><s:Body><GetOrderWithIntegrationCodeResponse><GetOrderWithIntegrationCodeResult><Order><IntegrationCode>${ref}</IntegrationCode><PieceDetails><PieceDetail><BarcodeNumber>${barcode}</BarcodeNumber></PieceDetail></PieceDetails></Order></GetOrderWithIntegrationCodeResult></GetOrderWithIntegrationCodeResponse></s:Body></s:Envelope>`;
 const reply=(xml:string)=>({ok:true,text:async()=>xml});
 const missing = '<s:Envelope><s:Body><GetOrderWithIntegrationCodeResponse><GetOrderWithIntegrationCodeResult/></GetOrderWithIntegrationCodeResponse></s:Body></s:Envelope>';
 beforeEach(()=>{process.env={...saved,ARAS_CUSTOMER_CODE:'c',ARAS_SET_ORDER_USERNAME:'u',ARAS_SET_ORDER_PASSWORD:'s',ARAS_SET_ORDER_ENDPOINT:'https://test.invalid'};global.fetch=mock as never;});afterEach(()=>{process.env=saved;mock.mockReset();});
 it('requires a matching remote order and barcode and never fabricates tracking', async () => {
   mock.mockResolvedValueOnce(reply(missing)).mockResolvedValueOnce(reply(success)).mockResolvedValueOnce(reply(found()));
   await expect(new ArasShippingProvider().createShipment(input)).resolves.toMatchObject({reference:'ABCDEF',trackingNumber:null,payload:{registrationVerified:true}});
   expect(mock.mock.calls.map(([, options]) => options.headers.SOAPAction)).toEqual([
     '"http://tempuri.org/GetOrderWithIntegrationCode"', '"http://tempuri.org/SetOrder"', '"http://tempuri.org/GetOrderWithIntegrationCode"',
   ]);
 });
 it.each([found('OTHER'),found('ABCDEF','WRONG')])('rejects mismatched remote data before sending', async xml => {
   mock.mockResolvedValueOnce(reply(xml));
   await expect(new ArasShippingProvider().createShipment(input)).rejects.toThrow('Eşleşmiyor');
   expect(mock).toHaveBeenCalledTimes(1);
 });
 it('rejects a success code outside the SetOrder response', async () => {
   mock.mockResolvedValueOnce(reply(missing)).mockResolvedValueOnce(reply('<ResultCode>0</ResultCode>'));
   await expect(new ArasShippingProvider().createShipment(input)).rejects.toThrow('Geçersiz');
   expect(mock).toHaveBeenCalledTimes(2);
 });
 it('does not report success when the remote result is empty', async () => {
   mock.mockResolvedValueOnce(reply(missing)).mockResolvedValueOnce(reply(success)).mockResolvedValueOnce(reply(missing));
   await expect(new ArasShippingProvider().createShipment(input)).rejects.toThrow('Bulunamadı');
 });
 it('recovers a shipment after an interrupted response without submitting it again', async () => {
   mock.mockResolvedValueOnce(reply(missing)).mockRejectedValueOnce(new Error('Connection reset')).mockResolvedValueOnce(reply(found()));
   const provider = new ArasShippingProvider();
   await expect(provider.createShipment(input)).rejects.toThrow('Ulaşılamadı');
   await expect(provider.createShipment(input)).resolves.toMatchObject({reference:'ABCDEF',payload:{registrationVerified:true}});
   expect(mock.mock.calls.filter(([, options]) => options.headers.SOAPAction.includes('/SetOrder'))).toHaveLength(1);
 });
});
