import { ArasShippingProvider } from './aras-shipping.provider';

describe('ArasShippingProvider', () => {
  const environment = process.env;
  const fetchMock = jest.fn();

  beforeEach(() => {
    process.env = {
      ...environment,
      ARAS_CUSTOMER_CODE: 'customer',
      ARAS_SET_ORDER_USERNAME: 'user',
      ARAS_SET_ORDER_PASSWORD: 'secret',
      ARAS_SET_ORDER_ENDPOINT: 'https://aras.example.test/service.asmx',
    };
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env = environment;
    jest.resetAllMocks();
  });

  it('sends the documented SetOrder payload and returns a successful shipment', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => '<ResultCode>0</ResultCode><ResultMessage>Başarılı</ResultMessage><CargoKey>ARAS123</CargoKey>' });
    const result = await new ArasShippingProvider().createShipment({ orderId: 'order-id', orderNumber: '20260001', recipientName: 'Ada Çay', phone: '+90 538 040 20 84', city: 'İstanbul', district: 'Beykoz', addressLine: 'Çay Sokak 1' });

    expect(result).toMatchObject({ reference: 'ORDERID', trackingNumber: 'ARAS123' });
    expect(fetchMock.mock.calls[0][1].body).toContain('<IntegrationCode>ORDERID</IntegrationCode>');
    expect(fetchMock.mock.calls[0][1].body).toContain('<ReceiverPhone1>5380402084</ReceiverPhone1>');
  });
});
