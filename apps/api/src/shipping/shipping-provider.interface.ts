export interface ShippingProvider {
  createShipment(input: { orderId: string; recipientName: string; phone: string; city: string; district: string; addressLine: string }): Promise<{ reference: string; trackingNumber: string }>;
}
