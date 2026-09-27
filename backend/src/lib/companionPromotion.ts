import type { PoolClient } from 'pg';
import {membershipDateOnly} from './membershipValidity.js';

export const OCTOBER_COMPANION_PROMOTION = {
  campaignId: '2026-october-companions', startDate: '2026-09-28', endDate: '2026-10-31',
} as const;

export function promotionalGuestCount(plan: {duration_days:number;multi_credits:number|null;is_internal?:boolean}): number {
  if (Number(plan.duration_days)!==30 || plan.is_internal) return 0;
  if (plan.multi_credits===null) return 2;
  return Number(plan.multi_credits)===8 ? 1 : 0;
}

/** Membership is already locked by lockCompanionHost, so this snapshot is serialized. */
export async function readCompanionPromotion(db:PoolClient,ctx:{cls:any;host:any;membership:any}) {
  const {cls,host,membership:m}=ctx, campaign=OCTOBER_COMPANION_PROMOTION;
  const date=membershipDateOnly(cls.date);
  if (!m?.plan_id || cls.category!=='multi' || date<campaign.startDate || date>campaign.endDate || cls.studio_today>campaign.endDate) return null;
  const plan=(await db.query(`SELECT duration_days,multi_credits,is_internal FROM plans WHERE id=$1`,[m.plan_id])).rows[0];
  const total=plan ? promotionalGuestCount(plan) : 0;
  if (!total) return null;
  // Existing included reservations are honored and count toward the promotional
  // total, even if an older app instance created them during rollout.
  const used=(await db.query(`SELECT bc.id,bc.host_booking_id,bc.promotion_slot,bc.mode
    FROM booking_companions bc JOIN bookings b ON b.id=bc.host_booking_id JOIN classes c ON c.id=b.class_id
    WHERE bc.membership_id=$1 AND NOT bc.free_released AND
      ((bc.mode='promo_free' AND bc.campaign_id=$2) OR
       (bc.mode='monthly_free' AND c.date BETWEEN $3::date AND $4::date))
    ORDER BY bc.created_at,bc.id`,[m.id,campaign.campaignId,campaign.startDate,campaign.endDate])).rows;
  const taken=new Set<number>(used.filter(r=>r.promotion_slot!=null).map(r=>Number(r.promotion_slot)));
  for (const r of used.filter(r=>r.promotion_slot==null)) {
    const slot=Array.from({length:total},(_,i)=>i+1).find(n=>!taken.has(n));
    if(slot) taken.add(slot);
  }
  const availableSlots=Array.from({length:total},(_,i)=>i+1).filter(n=>!taken.has(n));
  const remaining=Math.max(0,total-used.length);
  const sameOccasion=used.every(r=>r.host_booking_id===host.id);
  const reason=!sameOccasion && remaining>0 ? 'Las cortesías de esta promoción deben usarse en la misma clase.' : undefined;
  return {...campaign,total,remaining,requiredGuests:remaining,eligible:remaining>0 && sameOccasion,reason,availableSlots};
}
