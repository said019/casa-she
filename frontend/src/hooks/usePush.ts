import { useCallback, useEffect, useState } from 'react';
import { isPushSupported, getPermission, getActiveSubscription, subscribeToPush, unsubscribeFromPush } from '@/lib/push';

type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed' | 'loading';

export function usePush() {
  const [state, setState] = useState<PushState>('loading');

  const refresh = useCallback(async () => {
    if (!isPushSupported()) { setState('unsupported'); return; }
    const perm = getPermission();
    if (perm === 'denied') { setState('denied'); return; }
    const sub = await getActiveSubscription();
    setState(sub ? 'subscribed' : 'default');
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const enable = useCallback(async () => {
    setState('loading');
    try { await subscribeToPush(); setState('subscribed'); }
    catch { await refresh(); }
  }, [refresh]);

  const disable = useCallback(async () => {
    setState('loading');
    try { await unsubscribeFromPush(); } finally { setState('default'); }
  }, []);

  return { state, enable, disable };
}
