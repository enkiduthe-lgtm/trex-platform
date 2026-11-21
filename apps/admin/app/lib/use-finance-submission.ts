'use client';
import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from './api';

type Intent={body:string;key:string};
type Receipt={id:string;replayed?:boolean};
export function useFinanceSubmission(){
 const intent=useRef<Intent|null>(null),lock=useRef(false),alive=useRef(true);
 const [pending,setPending]=useState<Intent|null>(null),[busy,setBusy]=useState(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function send(body:string){
  if(!alive.current||lock.current)throw new Error('Finans işlemi zaten devam ediyor.');
  if(intent.current&&intent.current.body!==body)throw new Error('Önce sonucu doğrulanamayan para hareketini kontrol edin.');
  lock.current=true;if(alive.current)setBusy(true);
  let attempt:Intent|null=null;
  try{
   if(!alive.current)throw new Error('Finans ekranı kapatıldı. Yeni işlem gönderilmedi.');
   attempt=intent.current??{body,key:crypto.randomUUID()};intent.current=attempt;
   const result=await api<Receipt>('/admin/finance/transactions/idempotent',{method:'POST',headers:{'Idempotency-Key':attempt.key},body:attempt.body});
   if(!result||typeof result.id!=='string'||!result.id)throw new Error('Para hareketinin yanıtı doğrulanamadı. Aynı işlemi yeniden kontrol edin.');
   intent.current=null;if(alive.current)setPending(null);return result;
  }catch(error){
   const rejected=error instanceof ApiError&&error.status>=400&&error.status<500&&![408,429,499].includes(error.status);
   if(rejected){intent.current=null;if(alive.current)setPending(null);}
   else if(attempt&&alive.current)setPending(attempt);
   throw error;
  }finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function retry(){if(!intent.current)throw new Error('Kontrol edilecek finans işlemi bulunmuyor.');return send(intent.current.body);}
 return {send,retry,pending,busy};
}

export function validFinanceAmount(value:string){
 if(!/^\d+(?:\.\d{1,2})?$/.test(value))return false;
 const [whole,fraction='']=value.split('.'),amount=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return amount>0n&&amount<=999999999999n;
}
