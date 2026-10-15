/** Required before serving payment reads or calendar assignments. Idempotent. */
export const calendarMembershipDDL = `
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS membership_assignment_requests (
        actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        request_key VARCHAR(128) NOT NULL,
        request_hash VARCHAR(64) NOT NULL,
        membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY(actor_id,request_key)
    );
`;
