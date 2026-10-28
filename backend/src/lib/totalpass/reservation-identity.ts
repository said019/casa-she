import type { TotalPassOfficialEvent, TotalPassOfficialSlot } from './client.js';

export function tpLocalTime(value: unknown): string {
    const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
    if (!m) return '';
    let hour = Number(m[1]);
    if (Number(m[2]) > 59 || (m[3] ? hour < 1 || hour > 12 : hour > 23)) return '';
    if (m[3]) hour = hour % 12 + (m[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${m[2]}`;
}

export function reservationIdentity(slot: TotalPassOfficialSlot, events: TotalPassOfficialEvent[]) {
    let occurrenceId = String(slot.eventOccurrenceUuid || slot.occurrenceUuid || '') || null;
    const explicitOccurrence = occurrenceId;
    const matches: string[] = [];
    const refs = new Set<string>();
    for (const event of events) for (const o of event.EventOccurrences || []) {
        const id = String(o.eventOccurrenceUuid || o.occurrenceUuid || '');
        const matchesSlot = explicitOccurrence ? id === explicitOccurrence
            : String(event.id) === String(slot.event?.id || slot.eventId || '')
                && String(o.eventDate).slice(0, 10) === String(slot.slotDate).slice(0, 10)
                && tpLocalTime(o.startTime) === tpLocalTime(slot.startTime)
                && !!tpLocalTime(slot.startTime);
        if (!matchesSlot) continue;
        matches.push(id);
        const ref = String(o.externalReference || event.externalReference || '');
        if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(ref)) refs.add(ref);
    }
    if (!explicitOccurrence && matches.length === 1) occurrenceId = matches[0] || null;
    return { occurrenceId, classId: matches.length === 1 && refs.size === 1 ? [...refs][0] : null };
}
