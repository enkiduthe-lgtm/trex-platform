'use client';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { orderPermissions } from './order-permissions';

export function useOrderPermissions() {
  const [permissions, setPermissions] = useState(() => orderPermissions(''));
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshRef=useRef<(()=>Promise<void>)|null>(null);
  useEffect(() => {
    let active=true,inFlight=false;
    const refresh=async()=>{
      if(!active||inFlight)return;
      inFlight=true;
      try{
        const me=await api<{user:{role:string}}>('/auth/me');
        if(!active)return;
        if(typeof me?.user?.role!=='string'||!me.user.role)throw new Error('Geçersiz hesap yanıtı');
        const currentRole=me.user.role;
        const profile=currentRole==='ADMIN'?await api<{configured:boolean;grants:string[]|null}>('/admin/access/me'):undefined;
        if(currentRole==='ADMIN'&&(!profile||typeof profile.configured!=='boolean'||!(profile.grants===null||Array.isArray(profile.grants)&&profile.grants.every(grant=>typeof grant==='string'))))throw new Error('Geçersiz yetki yanıtı');
        if(active){setRole(currentRole);setPermissions(orderPermissions(currentRole,profile));setError('');}
      }catch{
        if(active){setRole('');setPermissions(orderPermissions(''));setError('İşlem yetkileri doğrulanamadı. Yeniden kontrol edilene kadar işlem düğmeleri kapalıdır.');}
      }finally{inFlight=false;if(active)setLoading(false);}
    };
    const refreshVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    refreshRef.current=refresh;void refresh();
    const timer=window.setInterval(refreshVisible,60_000);
    window.addEventListener('focus',refreshVisible);document.addEventListener('visibilitychange',refreshVisible);
    return()=>{active=false;window.clearInterval(timer);window.removeEventListener('focus',refreshVisible);document.removeEventListener('visibilitychange',refreshVisible);if(refreshRef.current===refresh)refreshRef.current=null;};
  }, []);
  return { permissions, role, loading, error, refresh:()=>refreshRef.current?.() };
}
