import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { buildToken, parseToken, type PayFrequency } from '@/lib/payrollPeriod';

interface PeriodPickerProps {
    frequency: PayFrequency;
    value: string;                       // token actual
    onChange: (token: string) => void;
}

// Selector de periodo de nómina. Mensual = solo mes; quincenal = mes + 1ª/2ª quincena.
export function PeriodPicker({ frequency, value, onChange }: PeriodPickerProps) {
    const parsed = parseToken(value);
    const month = parsed.month;
    const half = (parsed.half ?? 1) as 1 | 2;

    return (
        <>
            <div className="space-y-1">
                <Label className="text-xs">Mes</Label>
                <Input
                    type="month"
                    value={month}
                    onChange={(e) => {
                        const m = e.target.value;
                        if (!m) return;
                        onChange(buildToken(frequency, m, half));
                    }}
                    className="h-8 text-xs w-40"
                />
            </div>
            {frequency === 'biweekly' && (
                <div className="space-y-1">
                    <Label className="text-xs">Quincena</Label>
                    <Select
                        value={String(half)}
                        onValueChange={(v) => onChange(buildToken('biweekly', month, Number(v) as 1 | 2))}
                    >
                        <SelectTrigger className="h-8 w-44">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1">1ª quincena (1–15)</SelectItem>
                            <SelectItem value="2">2ª quincena (16–fin)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}
        </>
    );
}
