'use client';
import { deliveryFieldRules, type DealerDeliveryField } from '../lib/dealer-order-validation';
import styles from './portal.module.css';

export function DeliveryField({name,value,error,onChange}:{name:DealerDeliveryField;value:string;error?:string;onChange:(value:string)=>void}) {
 const rule=deliveryFieldRules[name],id=`bayi-${name}`;
 const common={id,value,required:name!=='postalCode',maxLength:rule.maxLength,autoComplete:rule.autoComplete,
  'aria-invalid':error?true:undefined,'aria-describedby':error?`${id}-error`:undefined};
 return <label htmlFor={id}>{rule.label}{name==='postalCode'&&' (İsteğe bağlı)'}
  {name==='addressLine'?<textarea {...common} rows={3} onChange={event=>onChange(event.target.value)}/>:
   <input {...common} type={name==='contactEmail'?'email':name==='phone'?'tel':'text'} onChange={event=>onChange(event.target.value)}/>}
  {error&&<small id={`${id}-error`} className={styles.fieldError}>{error}</small>}
 </label>;
}
