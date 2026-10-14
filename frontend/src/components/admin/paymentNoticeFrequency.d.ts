export function noticeWindow(now?:Date):string;
export function eligibleNotice(notice:unknown,now?:Date):boolean;
export function claimNotice(key:string,storage:Storage,locks?:LockManager,stillValid?:()=>boolean):Promise<boolean>;
