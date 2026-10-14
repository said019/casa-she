import { usePaymentNoticeFrequency } from './usePaymentNoticeFrequency';
import {getStoredToken} from '../../lib/api';
import {useEffect,useRef,useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../ui/dialog';
import {montarAviso} from './paymentNoticeBanner.js';
export function PaymentNotice({role}:{role?:string}) {
  const ref=useRef<HTMLDivElement>(null);
  const [notice,setNotice]=useState<{fecha:string;ciclo:string;texto:string}|null>(null);
  const [dismissed,setDismissed]=useState('');
  const allowed=role==='admin'||role==='super_admin';
  useEffect(()=>{
    if(!allowed||!ref.current)return;
    return montarAviso(ref.current,{
      endpoint:'/api/admin/platform-payment-notice',
      onNotice:setNotice,
      fetchImpl:(url,options)=>{
        const token=getStoredToken();
        if(!token)return Promise.resolve(new Response('',{status:401}));
        const endpoint=`${(import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/$/,'')}/admin/platform-payment-notice`;
        return fetch(endpoint,{...options,headers:{Authorization:`Bearer ${token}`}});
      },
    });
  },[allowed]);
  const key=usePaymentNoticeFrequency(notice,allowed);
  if(!allowed)return null;
  return <>
    <div className="hidden" aria-hidden="true"><div ref={ref} hidden/></div>
    <Dialog open={!!notice&&!!key&&dismissed!==key} onOpenChange={open=>{if(!open)setDismissed(key);}}>
      <DialogContent className="rounded-2xl max-w-md p-6 sm:p-8">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Tu plataforma · Recordatorio</p>
        <DialogTitle>Fecha de pago de tu plataforma</DialogTitle>
        <DialogDescription>{notice?.texto}</DialogDescription>
        <p className="text-sm text-muted-foreground">Este aviso es informativo. Puedes cerrarlo y continuar trabajando.</p>
        <button className="rounded-lg bg-primary px-5 py-3 text-primary-foreground" onClick={()=>setDismissed(key)}>Entendido, continuar</button>
      </DialogContent>
    </Dialog>
  </>;
}


