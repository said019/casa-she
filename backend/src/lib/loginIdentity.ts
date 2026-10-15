import { z } from 'zod';

/** Mexican login identity: never truncate arbitrary international numbers. */
export function normalizeLoginPhone(value: string): string | null {
    const text = value.trim();
    if (!/^\+?[0-9 ()-]+$/.test(text)) return null;
    const digits = text.replace(/[ ()-]/g, '').replace(/^\+/, '');
    // Legacy staff use this sentinel when no phone was supplied. It is never
    // an account identity, with or without a Mexican country-code prefix.
    if (/^(?:52|521)?0{10}$/.test(digits)) return null;
    if (/^[0-9]{10}$/.test(digits) && !text.startsWith('+')) return digits;
    if (/^52[0-9]{10}$/.test(digits)) return digits.slice(2);
    if (/^521[0-9]{10}$/.test(digits)) return digits.slice(3);
    return null;
}

export const ClientEmailSchema = z.preprocess(
    value => value === undefined || value === null || (typeof value === 'string' && !value.trim()) ? null : value,
    z.string().trim().toLowerCase().email('Email inválido').max(255).nullable(),
);
export const ClientPhoneSchema = z.string().refine(value => normalizeLoginPhone(value) !== null,
    'WhatsApp inválido: usa 10 dígitos o la lada +52').transform(value => normalizeLoginPhone(value)!);

export const clientIdentityDDL = `
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
CREATE OR REPLACE FUNCTION normalize_login_phone(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE cleaned text; original text;
BEGIN
    original := btrim(value);
    IF original IS NULL OR original !~ '^\\+?[0-9 ()-]+$' THEN RETURN NULL; END IF;
    cleaned := regexp_replace(original, '[ ()-]', '', 'g');
    cleaned := regexp_replace(cleaned, '^\\+', '');
    IF cleaned ~ '^(52|521)?0{10}$' THEN RETURN NULL; END IF;
    IF cleaned ~ '^[0-9]{10}$' AND left(original,1) <> '+' THEN RETURN cleaned; END IF;
    IF cleaned ~ '^52[0-9]{10}$' THEN RETURN substr(cleaned,3); END IF;
    IF cleaned ~ '^521[0-9]{10}$' THEN RETURN substr(cleaned,4); END IF;
    RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION guard_user_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE canonical text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.phone IS NOT DISTINCT FROM OLD.phone AND NEW.email IS NOT DISTINCT FROM OLD.email THEN RETURN NEW; END IF;
    END IF;
    canonical := normalize_login_phone(NEW.phone);
    -- Serializes all account creation paths, including guest/staff. This VOLATILE
    -- trigger's SELECT observes the preceding lock holder's committed insertion.
    PERFORM pg_advisory_xact_lock(790321, 1);
    -- Preserve INSERT ... ON CONFLICT(email) used by startup seeds. The UNIQUE
    -- constraint rejects ordinary duplicate inserts; any upsert phone/email
    -- changes still pass through this trigger's UPDATE branch.
    IF TG_OP = 'INSERT' AND NEW.email IS NOT NULL AND EXISTS(SELECT 1 FROM users WHERE email = NEW.email) THEN
        RETURN NEW;
    END IF;
    IF EXISTS(SELECT 1 FROM users u WHERE u.id <> NEW.id AND
        ((canonical IS NOT NULL AND normalize_login_phone(u.phone) = canonical)
         OR (NEW.email IS NOT NULL AND lower(btrim(u.email)) = lower(btrim(NEW.email))))) THEN
        RAISE EXCEPTION 'Correo o teléfono ya registrado' USING ERRCODE='23505', CONSTRAINT='users_login_identity_key';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS users_identity_guard ON users;
CREATE TRIGGER users_identity_guard BEFORE INSERT OR UPDATE OF phone,email ON users
FOR EACH ROW EXECUTE FUNCTION guard_user_identity();
`;
