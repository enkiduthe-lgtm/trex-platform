// A missing acknowledgement must never be treated as proof that no email was sent.
export class NotificationDeliveryError extends Error {
  constructor(message:string,readonly uncertain:boolean){super(message);this.name='NotificationDeliveryError';}
}
