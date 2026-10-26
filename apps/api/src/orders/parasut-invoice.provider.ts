import { Injectable, ServiceUnavailableException } from '@nestjs/common';

type InvoiceLine = { description: string; quantity: number; unitPrice: number };
type InvoiceRequest = { customerType: 'INDIVIDUAL' | 'CORPORATE'; recipientName: string; identityNumber: string | null; companyName: string | null; taxNumber: string | null; taxOffice: string | null; billingAddress: string; billingCity: string | null; billingDistrict: string | null; email: string | null; orderNumber: string; issueDate: string; lines: InvoiceLine[] };

@Injectable()
export class ParasutInvoiceProvider {
  private configuration() {
    const value = {
      companyId: process.env.PARASUT_COMPANY_ID?.trim(),
      clientId: process.env.PARASUT_CLIENT_ID?.trim(),
      clientSecret: process.env.PARASUT_CLIENT_SECRET?.trim(),
      username: process.env.PARASUT_USERNAME?.trim(),
      password: process.env.PARASUT_PASSWORD,
    };
    if (!value.companyId || !value.clientId || !value.clientSecret || !value.username || !value.password) {
      throw new ServiceUnavailableException('Paraşüt bağlantısı henüz tamamlanmadı. Firma no, uygulama bilgileri ve Paraşüt yetkili e-posta/şifresi güvenli ayarlara girilmeli.');
    }
    return value as Required<typeof value>;
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const text = await response.text();
    let body: unknown = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      const message = typeof body === 'object' && body && 'errors' in body ? JSON.stringify((body as { errors: unknown }).errors) : text;
      throw new ServiceUnavailableException(`Paraşüt isteği başarısız oldu (${response.status}): ${message.slice(0, 500)}`);
    }
    return body as T;
  }

  private async accessToken(config: ReturnType<ParasutInvoiceProvider['configuration']>) {
    const form = new URLSearchParams({ grant_type: 'password', client_id: config.clientId, client_secret: config.clientSecret, username: config.username, password: config.password, redirect_uri: 'urn:ietf:wg:oauth:2.0:oob' });
    const result = await this.request<{ access_token: string }>('https://api.parasut.com/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    return result.access_token;
  }

  async issue(input: InvoiceRequest) {
    const config = this.configuration();
    const token = await this.accessToken(config);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/vnd.api+json' };
    const contact = await this.request<{ data: { id: string } }>(`https://api.parasut.com/v4/${config.companyId}/contacts`, {
      method: 'POST', headers, body: JSON.stringify({ data: { type: 'contacts', attributes: {
        name: input.customerType === 'CORPORATE' ? input.companyName : input.recipientName,
        contact_type: input.customerType === 'CORPORATE' ? 'company' : 'person',
        email: input.email || undefined, tax_number: input.customerType === 'CORPORATE' ? input.taxNumber : input.identityNumber,
        tax_office: input.customerType === 'CORPORATE' ? input.taxOffice : undefined,
        address: input.billingAddress, city: input.billingCity || undefined, district: input.billingDistrict || undefined,
      } } }),
    });
    const invoice = await this.request<{ data: { id: string; attributes?: { invoice_no?: string } } }>(`https://api.parasut.com/v4/${config.companyId}/sales_invoices`, {
      method: 'POST', headers, body: JSON.stringify({ data: { type: 'sales_invoices', attributes: {
        item_type: 'invoice', description: `TREX siparişi ${input.orderNumber}`, issue_date: input.issueDate, due_date: input.issueDate,
        currency: 'TRL', billing_address: input.billingAddress, billing_city: input.billingCity || undefined, billing_district: input.billingDistrict || undefined,
      }, relationships: { contact: { data: { id: contact.data.id, type: 'contacts' } }, details: { data: input.lines.map(line => ({ type: 'sales_invoice_details', attributes: { description: line.description, quantity: line.quantity, unit_price: line.unitPrice, vat_rate: 0 } })) } } } }),
    });
    return { providerInvoiceId: invoice.data.id, invoiceNumber: invoice.data.attributes?.invoice_no ?? null, payload: invoice };
  }
}
