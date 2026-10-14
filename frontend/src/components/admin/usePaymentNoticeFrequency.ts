import {useEffect,useRef,useState} from 'react';
import {noticeWindow,eligibleNotice,claimNotice} from './paymentNoticeFrequency.js';
export function usePaymentNoticeFrequency(notice:{fecha:string;texto:string}|null, allowed:boolean) {
 const [slot,setSlot]=useState(()=>noticeWindow());
 const [granted,setGranted]=useState('');
 const current=useRef({notice,allowed}); current.current={notice,allowed};
 const owned=useRef('');
 useEffect(()=>{
  const tick=()=>setSlot(noticeWindow());
  const timer=setInterval(tick,1000);
  window.addEventListener('focus',tick);
  return ()=>{clearInterval(timer);window.removeEventListener('focus',tick);};
 },[]);
 const valid=allowed&&eligibleNotice(notice);
 useEffect(()=>{
  let disposed=false;
  if(!valid){setGranted('');return;}
  if(owned.current===slot){setGranted(slot);return;}
  const stillValid=()=>!disposed&&current.current.allowed&&eligibleNotice(current.current.notice)&&noticeWindow()===slot;
  try {
   void Promise.resolve().then(()=>claimNotice(slot,window.localStorage,navigator.locks,stillValid)).then(ok=>{
    if(ok&&!disposed){owned.current=slot;setGranted(slot);}
   }).catch(()=>{if(!disposed)setGranted('');});
  } catch { setGranted(''); }
  return ()=>{disposed=true;};
 },[valid,slot]);
 return valid&&granted===slot?slot:'';
}
