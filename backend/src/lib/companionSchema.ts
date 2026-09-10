// Additive migration: historical bookings are untouched.
export const companionDDL = `
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_companion_booking BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS booking_companions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id UUID NOT NULL UNIQUE,
 host_booking_id UUID NOT NULL REFERENCES bookings(id),
 membership_id UUID NOT NULL REFERENCES memberships(id),
 guest_user_id UUID NOT NULL REFERENCES users(id),
 guest_name TEXT NOT NULL,
 guest_booking_id UUID UNIQUE REFERENCES bookings(id),
 mode TEXT NOT NULL CHECK (mode IN ('credit','monthly_free','paid')),
 status TEXT NOT NULL CHECK (status IN ('pending_payment','confirmed','cancelled','payment_review','refund_review','refunded')),
 cycle_start DATE NOT NULL,
 free_released BOOLEAN NOT NULL DEFAULT false,
 amount NUMERIC(10,2) NOT NULL DEFAULT 0,
 checkout_url TEXT,
 reason TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companions_host_idx ON booking_companions(host_booking_id);
CREATE UNIQUE INDEX IF NOT EXISTS companions_monthly_free_idx
 ON booking_companions(membership_id,cycle_start) WHERE mode='monthly_free' AND NOT free_released;
CREATE UNIQUE INDEX IF NOT EXISTS companions_guest_active_idx
 ON booking_companions(host_booking_id,guest_user_id) WHERE status IN ('pending_payment','confirmed');
CREATE TABLE IF NOT EXISTS companion_payments (
 reference TEXT PRIMARY KEY,
 companion_id UUID NOT NULL REFERENCES booking_companions(id),
 amount NUMERIC(10,2) NOT NULL,
 currency TEXT NOT NULL,
 status TEXT NOT NULL,
 payment_id UUID REFERENCES payments(id),
 received_by UUID REFERENCES users(id),
 fulfilled BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION sync_companion_cancellation() RETURNS trigger AS $$
DECLARE class_cancelled boolean; timely boolean; min_hours numeric;
BEGIN
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
  SELECT status='cancelled' INTO class_cancelled FROM classes WHERE id=NEW.class_id;
  IF NOT COALESCE(class_cancelled,false) AND EXISTS (
    SELECT 1 FROM booking_companions bc JOIN bookings gb ON gb.id=bc.guest_booking_id
    WHERE bc.host_booking_id=NEW.id AND gb.status IN ('confirmed','checked_in')
  ) THEN RAISE EXCEPTION 'COMPANIONS_ACTIVE'; END IF;
  UPDATE booking_companions SET status='cancelled',reason='La reserva de la titular fue cancelada.'
    WHERE host_booking_id=NEW.id AND status='pending_payment';
  SELECT COALESCE((value->>'min_hours')::numeric,5) INTO min_hours
    FROM system_settings WHERE key='cancellation_policy';
  SELECT ((date+start_time) AT TIME ZONE 'America/Mexico_City') >= now()+ COALESCE(min_hours,5)*interval '1 hour'
    INTO timely FROM classes WHERE id=NEW.class_id;
  UPDATE booking_companions SET
    status=CASE WHEN mode='paid' THEN 'refund_review' ELSE 'cancelled' END,
    free_released=CASE WHEN mode='monthly_free' THEN COALESCE(class_cancelled,false) OR COALESCE(timely,false) ELSE free_released END,
    reason=CASE WHEN mode='paid' THEN 'Reserva cancelada: revisar devolución en recepción.' ELSE reason END
    WHERE guest_booking_id=NEW.id AND status='confirmed';
 END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS companion_cancellation ON bookings;
CREATE TRIGGER companion_cancellation BEFORE UPDATE OF status ON bookings
 FOR EACH ROW EXECUTE FUNCTION sync_companion_cancellation();
`;
