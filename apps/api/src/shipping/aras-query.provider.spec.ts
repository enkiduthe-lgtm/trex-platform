import { ArasQueryProvider } from './aras-query.provider';

const record = (code = '6', direction = '1', reference = 'ORDERREF') => `<Table><MUSTERI_OZEL_KODU>${reference}</MUSTERI_OZEL_KODU><DURUM_KODU>${code}</DURUM_KODU><TIP_KODU>${direction}</TIP_KODU><KARGO_TAKIP_NO>123456789</KARGO_TAKIP_NO></Table>`;
const soap = (rows: string) => `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><GetQueryDSResponse xmlns="http://tempuri.org/"><GetQueryDSResult><diffgr:diffgram xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1"><NewDataSet>${rows}</NewDataSet></diffgr:diffgram></GetQueryDSResult></GetQueryDSResponse></s:Body></s:Envelope>`;
describe('Aras GetQueryDS contract', () => {
  const provider = new ArasQueryProvider();
  it('only confirms a matching, normal, fully delivered shipment', () => {
    expect(provider.parse(soap(record()), 'ORDERREF')).toMatchObject({ status: 'DELIVERED', trackingNumber: '123456789' });
  });
  it.each(['1', '2', '3', '4', '5', '7'])('does not finalize code %s as delivered', code => {
    expect(provider.parse(soap(record(code)), 'ORDERREF')?.status).toBe('IN_TRANSIT');
  });
  it('never confirms return-to-sender delivery as a customer delivery', () => {
    expect(provider.parse(soap(record('6', '3')), 'ORDERREF')).toMatchObject({ status: 'FAILED', direction: '3' });
  });
  it('rejects another reference, ambiguous shipments and unknown states', () => {
    for (const rows of [record('6', '1', 'OTHER'), record() + record(), record('999'), record('6', '')]) expect(() => provider.parse(soap(rows), 'ORDERREF')).toThrow();
  });
  it('empty datasets do not advance a shipment', () => {
    expect(provider.parse(soap(''), 'ORDERREF')).toBeNull();
  });
  it('handles encoded Turkish dataset field names', () => {
    const rows = record().replace('MUSTERI_OZEL_KODU', 'MÜŞTERİ_x0020_ÖZEL_x0020_KODU').replace('/MUSTERI_OZEL_KODU', '/MÜŞTERİ_x0020_ÖZEL_x0020_KODU');
    expect(provider.parse(soap(rows), 'ORDERREF')?.status).toBe('DELIVERED');
  });
  it('rejects SOAP faults, DTDs and oversized responses without exposing their content', () => {
    for (const body of ['<s:Envelope><s:Body><s:Fault>credential-secret</s:Fault></s:Body></s:Envelope>', '<!DOCTYPE a>'+soap(record()), 'x'.repeat(2_000_001)]) {
      try { provider.parse(body, 'ORDERREF'); throw new Error('Expected Rejection'); } catch (error) { expect(String(error)).not.toContain('credential-secret'); expect(String(error)).not.toContain('Expected Rejection'); }
    }
  });
  it('uses the verified HTTPS SOAP action and XML-escapes both string parameters', async () => {
    const previous = { ...process.env }, fetchBefore = global.fetch;
    process.env.ARAS_QUERY_USERNAME = 'user<&'; process.env.ARAS_QUERY_PASSWORD = 'password<&'; process.env.ARAS_CUSTOMER_CODE = '123';
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => soap('') }); global.fetch = fetchMock;
    try {
      await provider.query('REF<&');
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toMatch(/^https:\/\/customerservices\.araskargo\.com\.tr\//);
      expect(options.headers.SOAPAction).toBe('"http://tempuri.org/IArasCargoIntegrationService/GetQueryDS"');
      expect(options.body).toContain('&lt;QueryType&gt;1&lt;/QueryType&gt;');
      expect(options.body).toContain('REF&amp;lt;&amp;amp;');
      expect(options.body).not.toContain('password<&');
      expect(options.redirect).toBe('error');
    } finally { process.env = previous; global.fetch = fetchBefore; }
  });
});
