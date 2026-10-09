export type ShippingProviderInput = { orderId: string; orderNumber: string; recipientName: string; phone: string; city: string; district: string; addressLine: string; postalCode?: string | null; };
export type ShippingProviderResult = { reference: string; trackingNumber: string; labelUrl?: string; labelFormat?: string; payload?: unknown };
export interface ShippingProvider { createShipment(input: ShippingProviderInput): Promise<ShippingProviderResult>; }
