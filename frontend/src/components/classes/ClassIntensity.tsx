import React, { useId } from 'react';

export function isClassIntensity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 3;
}

export function ClassIntensity({ intensity }: { intensity?: number | null }) {
  if (!isClassIntensity(intensity)) return null;
  return (
    <span className="inline-block shrink-0 whitespace-nowrap text-sm align-middle" role="img" aria-label={`Intensidad ${intensity} de 3`}>
      <span aria-hidden="true">{'🔥'.repeat(intensity)}</span>
    </span>
  );
}

export function ClassIntensitySelector({ value, onChange }: {
  value?: number | null;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">Intensidad</label>
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={isClassIntensity(value) ? String(value) : ''}
        onChange={(event) => {
          const next = Number(event.target.value);
          onChange(isClassIntensity(next) ? next : null);
        }}
      >
        <option value="">Sin intensidad</option>
        <option value="1">🔥 — Intensidad 1 de 3</option>
        <option value="2">🔥🔥 — Intensidad 2 de 3</option>
        <option value="3">🔥🔥🔥 — Intensidad 3 de 3</option>
      </select>
    </div>
  );
}
