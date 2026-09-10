import { z } from 'zod';

/** Intensity is independent of the technical class level. NULL hides the badge. */
export const intensitySchema = z.number().int().min(1).max(3).nullable().optional();

export const classIntensityDDL = `
SELECT pg_advisory_xact_lock(9102026, 2);
ALTER TABLE classes ADD COLUMN IF NOT EXISTS intensity smallint
  CONSTRAINT classes_intensity_range CHECK (intensity BETWEEN 1 AND 3);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS intensity smallint
  CONSTRAINT schedules_intensity_range CHECK (intensity BETWEEN 1 AND 3);
`;
