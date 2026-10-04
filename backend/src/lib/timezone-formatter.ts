/**
 * Reuse only formatter configuration, never a date, offset or formatted value.
 * Each fixed format gets at most 16 timezone entries; uncommon zones can evict
 * entries without changing the result. Invalid timezone construction is not cached.
 */
export function createTimezoneFormatter(
    locale: string,
    options: Intl.DateTimeFormatOptions,
): (timezone: string) => Intl.DateTimeFormat {
    const formats = new Map<string, Intl.DateTimeFormat>();
    const fixedOptions = { ...options };
    return (timezone: string): Intl.DateTimeFormat => {
        const cached = formats.get(timezone);
        if (cached) {
            formats.delete(timezone);
            formats.set(timezone, cached);
            return cached;
        }
        const formatter = new Intl.DateTimeFormat(locale, { ...fixedOptions, timeZone: timezone });
        if (formats.size >= 16) formats.delete(formats.keys().next().value as string);
        formats.set(timezone, formatter);
        return formatter;
    };
}
