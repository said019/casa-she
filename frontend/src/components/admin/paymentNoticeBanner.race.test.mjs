import test from 'node:test';
import assert from 'node:assert/strict';
import { montarAviso } from './paymentNoticeBanner.js';
test('late failed response cannot hide a newer valid popup', async () => {
  const previousWindow=globalThis.window, previousDocument=globalThis.document;
  let focus, resolveOld, calls=0, shown=null;
  globalThis.window={location:{origin:'https://example.test'},addEventListener:(name,fn)=>{if(name==='focus')focus=fn;},removeEventListener(){}};
  globalThis.document={hidden:false,addEventListener(){},removeEventListener(){}};
  const fecha=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const aviso={fecha,texto:'Pago',ciclo:fecha.slice(0,7)};
  const element={hidden:true,textContent:'',setAttribute(){}};
  const cleanup=montarAviso(element,{endpoint:'/api/admin/platform-payment-notice',onNotice:n=>{shown=n;},fetchImpl:async()=>{
    calls++;if(calls===1)return new Promise(resolve=>{resolveOld=resolve;});
    return {ok:true,json:async()=>({aviso})};
  }});
  try {
    focus();await new Promise(r=>setTimeout(r,5));assert.deepEqual(shown,aviso);
    resolveOld({ok:false});await new Promise(r=>setTimeout(r,5));assert.deepEqual(shown,aviso);
  } finally {cleanup();globalThis.window=previousWindow;globalThis.document=previousDocument;}
});
