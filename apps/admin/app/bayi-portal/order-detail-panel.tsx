'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { OrderDetails, type DealerOrderDetail } from './order-details';

type Props={order:DealerOrderDetail;loadedAt:string|null;onClose:()=>void;onTrack:()=>void;onOpenCommissions:()=>void};
export function OrderDetailPanel({order,loadedAt,...actions}:Props) {
 const [snapshot,setSnapshot]=useState({source:order,order,updatedAt:loadedAt});
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const refreshRef=useRef<(()=>Promise<void>)|null>(null);
 useEffect(()=>{
  let active=true,inFlight=false;
  setSnapshot({source:order,order,updatedAt:loadedAt});setError('');setBusy(false);
  const refresh=async()=>{
   if(!active||inFlight)return;
   inFlight=true;setBusy(true);
   try {
    const result=await api<DealerOrderDetail>(`/dealer-portal/orders/${order.id}`);
    if(result.id!==order.id)throw new Error('Beklenen sipariş bilgisi alınamadı. Detayı yeniden açın.');
    if(active){setSnapshot({source:order,order:result,updatedAt:new Date().toISOString()});setError('');}
   }catch(reason){
    if(active)setError(reason instanceof Error?reason.message:'Sipariş detayı yenilenemedi.');
   }finally{inFlight=false;if(active)setBusy(false);}
  };
  const refreshVisible=()=>{if(document.visibilityState==='visible')void refresh();};
  refreshRef.current=refresh;
  const age=Date.now()-Date.parse(loadedAt??'');
  if(!Number.isFinite(age)||age<0||age>=30_000)refreshVisible();
  const timer=window.setInterval(refreshVisible,30_000);
  window.addEventListener('focus',refreshVisible);
  document.addEventListener('visibilitychange',refreshVisible);
  return ()=>{
   active=false;window.clearInterval(timer);
   window.removeEventListener('focus',refreshVisible);
   document.removeEventListener('visibilitychange',refreshVisible);
   if(refreshRef.current===refresh)refreshRef.current=null;
  };
 },[order,loadedAt]);
 // A different order must never briefly display the previous order's snapshot.
 const current=snapshot.source===order?snapshot:{order,updatedAt:loadedAt};
 return <OrderDetails order={current.order} {...actions} onRefresh={()=>void refreshRef.current?.()}
  refreshing={busy} refreshError={snapshot.source===order?error:''} refreshedAt={current.updatedAt}/>;
}
