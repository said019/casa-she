import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addDaysForInput, formatDateForInput } from '@/lib/date';

interface MembershipStartPickerProps {
  value: string;
  onChange: (date: string) => void;
  durationDays?: number | null;
  disabled?: boolean;
  id?: string;
}

export function MembershipStartPicker({
  value,
  onChange,
  durationDays,
  disabled = false,
  id = 'membership-start-date',
}: MembershipStartPickerProps) {
  const today = formatDateForInput();
  const [mode, setMode] = useState<'today' | 'custom' | null>(() =>
    value ? (value === today ? 'today' : 'custom') : null
  );

  useEffect(() => {
    if (!value) setMode(null);
    else if (value === today) setMode('today');
  }, [today, value]);

  const endDate = useMemo(
    () => value && durationDays ? addDaysForInput(value, durationDays) : null,
    [durationDays, value],
  );

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div>
        <Label>¿Cuándo inicia la membresía? *</Label>
        <p className="mt-1 text-xs text-muted-foreground">
          No podrá usarse para reservar clases anteriores a la fecha elegida.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant={mode === 'today' ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => { setMode('today'); onChange(today); }}
          aria-pressed={mode === 'today'}
        >
          Iniciar hoy
        </Button>
        <Button
          type="button"
          variant={mode === 'custom' ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => { setMode('custom'); onChange(''); }}
          aria-pressed={mode === 'custom'}
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          Elegir fecha
        </Button>
      </div>
      {mode === 'custom' && (
        <div className="space-y-2">
          <Label htmlFor={id}>Fecha de inicio</Label>
          <Input
            id={id}
            type="date"
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            required
          />
        </div>
      )}
      {value && (
        <p className="text-xs font-medium text-primary">
          Inicio: {value}{endDate ? ` · Fin estimado: ${endDate}` : ''}
        </p>
      )}
    </div>
  );
}
