'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Clock } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface TimePickerProps {
    value?: string; // HH:MM format
    onChange?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    minuteStep?: 5 | 10 | 15 | 30;
    minTime?: string; // HH:MM
    maxTime?: string; // HH:MM
}

const TimePicker = React.forwardRef<HTMLButtonElement, TimePickerProps>(
    ({ value, onChange, placeholder = 'Seleccionar hora', disabled, className, minuteStep = 5, minTime = '06:00', maxTime = '22:00' }, ref) => {
        const [open, setOpen] = React.useState(false);
        const [selectedHour, setSelectedHour] = React.useState<number | null>(null);
        const [selectedMinute, setSelectedMinute] = React.useState<number | null>(null);

        // Parse current value
        React.useEffect(() => {
            if (value) {
                const [h, m] = value.split(':').map(Number);
                setSelectedHour(h);
                setSelectedMinute(m);
            }
        }, [value]);

        // Generate hours based on min/max
        const minHour = parseInt(minTime.split(':')[0]);
        const maxHour = parseInt(maxTime.split(':')[0]);
        const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);

        // Generate minutes based on step
        const minutes = Array.from({ length: 60 / minuteStep }, (_, i) => i * minuteStep);

        const handleHourSelect = (hour: number) => {
            setSelectedHour(hour);
            if (selectedMinute !== null) {
                const timeStr = `${hour.toString().padStart(2, '0')}:${selectedMinute.toString().padStart(2, '0')}`;
                onChange?.(timeStr);
            }
        };

        const handleMinuteSelect = (minute: number) => {
            setSelectedMinute(minute);
            if (selectedHour !== null) {
                const timeStr = `${selectedHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                onChange?.(timeStr);
                setOpen(false);
            }
        };

        const formatDisplay = () => {
            if (!value) return null;
            const [h, m] = value.split(':').map(Number);
            const period = h >= 12 ? 'p.m.' : 'a.m.';
            const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
            return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
        };

        return (
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        ref={ref}
                        variant="outline"
                        role="combobox"
                        disabled={disabled}
                        className={cn(
                            'w-full justify-start text-left font-normal',
                            !value && 'text-muted-foreground',
                            className
                        )}
                    >
                        <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                        {formatDisplay() || placeholder}
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                    <div className="flex border-b">
                        <div className="flex-1 text-center text-xs font-medium py-2 text-muted-foreground border-r">
                            Hora
                        </div>
                        <div className="flex-1 text-center text-xs font-medium py-2 text-muted-foreground">
                            Minuto
                        </div>
                    </div>
                    <div className="flex h-[200px]">
                        {/* Hours Column */}
                        <ScrollArea className="w-20 border-r">
                            <div className="p-1">
                                {hours.map((hour) => {
                                    const period = hour >= 12 ? 'p.m.' : 'a.m.';
                                    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
                                    return (
                                        <button
                                            key={hour}
                                            type="button"
                                            onClick={() => handleHourSelect(hour)}
                                            className={cn(
                                                'w-full px-2 py-1.5 text-sm rounded-md transition-colors text-left',
                                                'hover:bg-muted focus:bg-muted focus:outline-none',
                                                selectedHour === hour && 'bg-primary text-primary-foreground hover:bg-primary'
                                            )}
                                        >
                                            {displayHour} {period}
                                        </button>
                                    );
                                })}
                            </div>
                        </ScrollArea>

                        {/* Minutes Column */}
                        <ScrollArea className="w-16">
                            <div className="p-1">
                                {minutes.map((minute) => (
                                    <button
                                        key={minute}
                                        type="button"
                                        onClick={() => handleMinuteSelect(minute)}
                                        disabled={selectedHour === null}
                                        className={cn(
                                            'w-full px-2 py-1.5 text-sm rounded-md transition-colors',
                                            'hover:bg-muted focus:bg-muted focus:outline-none',
                                            'disabled:opacity-50 disabled:cursor-not-allowed',
                                            selectedMinute === minute && selectedHour !== null && 'bg-primary text-primary-foreground hover:bg-primary'
                                        )}
                                    >
                                        :{minute.toString().padStart(2, '0')}
                                    </button>
                                ))}
                            </div>
                        </ScrollArea>
                    </div>
                    
                    {/* Quick Actions */}
                    <div className="border-t p-2 flex gap-1 justify-center">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7"
                            onClick={() => {
                                handleHourSelect(7);
                                handleMinuteSelect(0);
                            }}
                        >
                            7:00
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7"
                            onClick={() => {
                                handleHourSelect(9);
                                handleMinuteSelect(0);
                            }}
                        >
                            9:00
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7"
                            onClick={() => {
                                handleHourSelect(18);
                                handleMinuteSelect(0);
                            }}
                        >
                            6:00 p.m.
                        </Button>
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7"
                            onClick={() => {
                                handleHourSelect(19);
                                handleMinuteSelect(0);
                            }}
                        >
                            7:00 p.m.
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        );
    }
);

TimePicker.displayName = 'TimePicker';

export { TimePicker };
