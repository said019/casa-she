import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Plus, X, ClipboardList, Bell, Check, Save, Rocket, Bird, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EVENT_TYPES } from './types';
import { EventTypeIcon } from './EventTypeIcon';
import type { EventType, StudioEvent } from './types';
import api from '@/lib/api';

interface CreateEventViewProps {
  onBack: () => void;
  onSave: (formData: any, status: 'draft' | 'published') => void;
  isSaving?: boolean;
  initialData?: StudioEvent | null;
}

const steps = [
  { num: 1, label: 'Tipo y detalles' },
  { num: 2, label: 'Fecha y lugar' },
  { num: 3, label: 'Precios' },
  { num: 4, label: 'Extras y publicar' },
];

export default function CreateEventView({ onBack, onSave, isSaving, initialData }: CreateEventViewProps) {
  const isEditing = !!initialData;
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    type: (initialData?.type || '') as EventType | '',
    title: initialData?.title || '',
    description: initialData?.description || '',
    instructor: initialData?.instructor || '',
    date: initialData?.date || '',
    startTime: initialData?.startTime || '',
    endTime: initialData?.endTime || '',
    location: initialData?.location || '',
    capacity: initialData?.capacity || 8,
    price: initialData?.price || 0,
    earlyBirdPrice: initialData?.earlyBirdPrice || 0,
    earlyBirdDeadline: initialData?.earlyBirdDeadline || '',
    memberDiscount: initialData?.memberDiscount || 0,
    requirements: initialData?.requirements || '',
    includes: initialData?.includes?.length ? initialData.includes : [''],
    tags: initialData?.tags || [] as string[],
    walletPass: false,
    waitlist: initialData?.waitlistEnabled ?? true,
    autoReminders: initialData?.autoReminders ?? false,
  });

  // Fetch instructors for dropdown
  const { data: instructors = [] } = useQuery<{ id: string; display_name: string }[]>({
    queryKey: ['instructors-list'],
    queryFn: async () => {
      const res = await api.get('/instructors');
      return res.data;
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const update = (partial: Partial<typeof form>) => {
    setForm({ ...form, ...partial });
    // Clear errors for the fields being updated
    const cleared = { ...errors };
    Object.keys(partial).forEach((k) => delete cleared[k]);
    setErrors(cleared);
  };

  /** Validate fields for the current step. Returns true if valid. */
  const validateStep = (s: number): boolean => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.type) errs.type = 'Selecciona un tipo de evento';
      if (form.title.trim().length < 3) errs.title = 'El título debe tener al menos 3 caracteres';
      if (form.description.trim().length < 10) errs.description = 'La descripción debe tener al menos 10 caracteres';
      if (!form.instructor) errs.instructor = 'Selecciona un instructor';
    }
    if (s === 2) {
      if (!form.date) errs.date = 'Selecciona una fecha';
      if (!form.startTime) errs.startTime = 'Indica la hora de inicio';
      if (!form.endTime) errs.endTime = 'Indica la hora de fin';
      if (!form.location || form.location.trim().length < 2) errs.location = 'Indica la ubicación';
      if (!form.capacity || form.capacity < 1) errs.capacity = 'La capacidad debe ser al menos 1';
    }
    if (s === 3) {
      if (form.price < 0) errs.price = 'El precio no puede ser negativo';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = () => ({
    type: form.type,
    title: form.title.trim(),
    description: form.description.trim(),
    instructor_name: form.instructor,
    date: form.date,
    start_time: form.startTime,
    end_time: form.endTime,
    location: form.location.trim(),
    capacity: Number(form.capacity) || 8,
    price: Number(form.price) || 0,
    early_bird_price: form.earlyBirdPrice ? Number(form.earlyBirdPrice) : null,
    early_bird_deadline: form.earlyBirdDeadline || null,
    member_discount: Number(form.memberDiscount) || 0,
    requirements: form.requirements.trim(),
    includes: form.includes.filter(Boolean),
    tags: form.tags,
    waitlist_enabled: form.waitlist,
    wallet_pass: form.walletPass,
    auto_reminders: form.autoReminders,
    required_payment: true,
    allow_cancellations: false,
  });

  return (
    <div className="space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-2 -ml-2 text-primary">
        <ArrowLeft className="h-4 w-4" />
        Volver a eventos
      </Button>

      <div>
        <h1 className="text-3xl font-heading font-bold">
          {isEditing ? 'Editar Evento' : 'Crear Nuevo Evento'}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isEditing ? 'Modifica los detalles de tu evento' : 'Configura todos los detalles de tu evento especial'}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex gap-2">
        {steps.map((s) => (
          <div key={s.num} className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                  step > s.num
                    ? 'bg-primary text-primary-foreground'
                    : step === s.num
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {step > s.num ? <Check className="h-4 w-4" /> : s.num}
              </div>
              <span className={cn('text-sm font-semibold hidden sm:inline', step >= s.num ? 'text-foreground' : 'text-muted-foreground')}>
                {s.label}
              </span>
            </div>
            <div className={cn('h-1 rounded-full transition-colors', step >= s.num ? 'bg-primary' : 'bg-muted')} />
          </div>
        ))}
      </div>

      {/* Form Card */}
      <Card>
        <CardContent className="p-6">
          {/* ───── STEP 1: Type & Details ───── */}
          {step === 1 && (
            <div className="space-y-6">
              <h3 className="text-lg font-heading font-bold">¿Qué tipo de evento quieres crear?</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {EVENT_TYPES.map((t) => (
                  <div
                    key={t.value}
                    onClick={() => update({ type: t.value })}
                    className={cn(
                      'p-4 rounded-xl border-2 cursor-pointer text-center transition-all hover:shadow-sm',
                      form.type === t.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/30'
                    )}
                  >
                    <div className="flex justify-center mb-2">
                      <EventTypeIcon typeInfo={t} className="h-6 w-6" />
                    </div>
                    <p className={cn('text-sm font-semibold', form.type === t.value ? 'text-primary' : 'text-foreground')}>
                      {t.label}
                    </p>
                  </div>
                ))}
              </div>
              {errors.type && <p className="text-xs text-destructive mt-1">{errors.type}</p>}

              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Título del evento *</Label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) => update({ title: e.target.value })}
                    placeholder="Ej: Masterclass de Reformer Avanzado"
                    className={cn("mt-1.5", errors.title && "border-destructive")}
                  />
                  {errors.title && <p className="text-xs text-destructive mt-1">{errors.title}</p>}
                </div>
                <div>
                  <Label htmlFor="description">Descripción *</Label>
                  <Textarea
                    id="description"
                    value={form.description}
                    onChange={(e) => update({ description: e.target.value })}
                    placeholder="Describe el evento, qué aprenderán, qué incluye..."
                    rows={4}
                    className={cn("mt-1.5", errors.description && "border-destructive")}
                  />
                  {errors.description && <p className="text-xs text-destructive mt-1">{errors.description}</p>}
                </div>
                <div>
                  <Label htmlFor="instructor">Instructor / Facilitador *</Label>
                  <Select
                    value={form.instructor}
                    onValueChange={(value) => update({ instructor: value })}
                  >
                    <SelectTrigger className={cn("mt-1.5", errors.instructor && "border-destructive")}>
                      <SelectValue placeholder="Selecciona un instructor" />
                    </SelectTrigger>
                    <SelectContent>
                      {instructors.map((inst) => (
                        <SelectItem key={inst.id} value={inst.display_name}>
                          {inst.display_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.instructor && <p className="text-xs text-destructive mt-1">{errors.instructor}</p>}
                </div>
              </div>
            </div>
          )}

          {/* ───── STEP 2: Date & Location ───── */}
          {step === 2 && (
            <div className="space-y-6">
              <h3 className="text-lg font-heading font-bold">¿Cuándo y dónde será?</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="date">Fecha *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) => update({ date: e.target.value })}
                    className={cn("mt-1.5", errors.date && "border-destructive")}
                  />
                  {errors.date && <p className="text-xs text-destructive mt-1">{errors.date}</p>}
                </div>
                <div>
                  <Label htmlFor="capacity">Capacidad máxima *</Label>
                  <Input
                    id="capacity"
                    type="number"
                    value={form.capacity || ''}
                    onChange={(e) => update({ capacity: e.target.value === '' ? 0 : Math.max(1, parseInt(e.target.value) || 0) })}
                    min={1}
                    className={cn("mt-1.5", errors.capacity && "border-destructive")}
                  />
                  {errors.capacity && <p className="text-xs text-destructive mt-1">{errors.capacity}</p>}
                </div>
                <div>
                  <Label htmlFor="startTime">Hora inicio *</Label>
                  <Input
                    id="startTime"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => update({ startTime: e.target.value })}
                    className={cn("mt-1.5", errors.startTime && "border-destructive")}
                  />
                  {errors.startTime && <p className="text-xs text-destructive mt-1">{errors.startTime}</p>}
                </div>
                <div>
                  <Label htmlFor="endTime">Hora fin *</Label>
                  <Input
                    id="endTime"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => update({ endTime: e.target.value })}
                    className={cn("mt-1.5", errors.endTime && "border-destructive")}
                  />
                  {errors.endTime && <p className="text-xs text-destructive mt-1">{errors.endTime}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="location">Ubicación *</Label>
                  <Input
                    id="location"
                    value={form.location}
                    onChange={(e) => update({ location: e.target.value })}
                    placeholder="Ej: Sala Principal, Parque, Hacienda..."
                    className={cn("mt-1.5", errors.location && "border-destructive")}
                  />
                  {errors.location && <p className="text-xs text-destructive mt-1">{errors.location}</p>}
                </div>
              </div>
            </div>
          )}

          {/* ───── STEP 3: Pricing ───── */}
          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-heading font-bold">Precios y descuentos</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="price">Precio general (MXN) *</Label>
                  <Input
                    id="price"
                    type="number"
                    value={form.price || ''}
                    onChange={(e) => update({ price: parseInt(e.target.value) || 0 })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="memberDiscount">% Descuento miembros</Label>
                  <Input
                    id="memberDiscount"
                    type="number"
                    value={form.memberDiscount || ''}
                    onChange={(e) => update({ memberDiscount: parseInt(e.target.value) || 0 })}
                    max={50}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="earlyBirdPrice">Precio Early Bird (MXN)</Label>
                  <Input
                    id="earlyBirdPrice"
                    type="number"
                    value={form.earlyBirdPrice || ''}
                    onChange={(e) => update({ earlyBirdPrice: parseInt(e.target.value) || 0 })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label htmlFor="earlyBirdDeadline">Fecha límite Early Bird</Label>
                  <Input
                    id="earlyBirdDeadline"
                    type="date"
                    value={form.earlyBirdDeadline}
                    onChange={(e) => update({ earlyBirdDeadline: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              {/* Preview Pricing */}
              {form.price > 0 && (
                <div className="bg-muted/50 rounded-xl p-5">
                  <p className="text-sm font-semibold text-muted-foreground mb-3">Vista previa de precios:</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-card rounded-lg p-4 text-center border">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">General</p>
                      <p className="text-2xl font-bold text-foreground">${form.price}</p>
                    </div>
                    {form.earlyBirdPrice > 0 && (
                      <div className="bg-card rounded-lg p-4 text-center border-2 border-emerald-300">
                        <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                          <Bird className="h-3 w-3" /> Early Bird
                        </p>
                        <p className="text-2xl font-bold text-emerald-600">${form.earlyBirdPrice}</p>
                        <p className="text-[10px] text-muted-foreground">Ahorro: ${form.price - form.earlyBirdPrice}</p>
                      </div>
                    )}
                    {form.memberDiscount > 0 && (
                      <div className="bg-card rounded-lg p-4 text-center border-2 border-primary">
                        <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-1 flex items-center justify-center gap-1">
                          <Crown className="h-3 w-3" /> Miembros
                        </p>
                        <p className="text-2xl font-bold text-primary">
                          ${Math.round(form.price * (1 - form.memberDiscount / 100))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{form.memberDiscount}% descuento</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ───── STEP 4: Extras ───── */}
          {step === 4 && (
            <div className="space-y-6">
              <h3 className="text-lg font-heading font-bold">Últimos detalles</h3>

              <div>
                <Label htmlFor="requirements">Requisitos de entrada</Label>
                <Input
                  id="requirements"
                  value={form.requirements}
                  onChange={(e) => update({ requirements: e.target.value })}
                  placeholder="Ej: Mínimo 6 meses de experiencia"
                  className="mt-1.5"
                />
              </div>

              <div>
                <Label>¿Qué incluye?</Label>
                <div className="space-y-2 mt-1.5">
                  {form.includes.map((item, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={item}
                        onChange={(e) => {
                          const n = [...form.includes];
                          n[i] = e.target.value;
                          update({ includes: n });
                        }}
                        placeholder={`Item ${i + 1}`}
                      />
                      {form.includes.length > 1 && (
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => update({ includes: form.includes.filter((_, j) => j !== i) })}
                          className="shrink-0 text-red-500 hover:text-red-700"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => update({ includes: [...form.includes, ''] })}
                    className="gap-1.5 border-dashed text-muted-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar item
                  </Button>
                </div>
              </div>

              <div className="bg-muted/50 rounded-xl p-5 space-y-1">
                <p className="text-sm font-bold text-foreground mb-3">Opciones adicionales</p>
                {[
                  { key: 'waitlist' as const, label: 'Habilitar lista de espera', desc: 'Cuando se llene la capacidad, permitir registros en espera', icon: <ClipboardList className="h-5 w-5 text-muted-foreground" /> },
                  { key: 'autoReminders' as const, label: 'Recordatorios automáticos', desc: 'Push 24h antes y 1h antes del evento', icon: <Bell className="h-5 w-5 text-muted-foreground" /> },
                ].map((opt) => (
                  <div key={opt.key} className="flex justify-between items-center py-3 border-b border-border/50 last:border-0">
                    <div className="flex gap-3 items-center">
                      {opt.icon}
                      <div>
                        <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.desc}</p>
                      </div>
                    </div>
                    <Switch
                      checked={form[opt.key]}
                      onCheckedChange={(checked) => update({ [opt.key]: checked })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <Button
              variant="outline"
              onClick={() => (step > 1 ? setStep(step - 1) : onBack())}
            >
              {step > 1 ? '← Anterior' : 'Cancelar'}
            </Button>
            <div className="flex gap-2">
              {step === 4 && !isEditing && (
                <Button
                  variant="outline"
                  onClick={() => {
                    // Validate all steps before saving as draft
                    const allValid = [1, 2, 3].every((s) => validateStep(s));
                    if (!allValid) return;
                    onSave(buildPayload(), 'draft');
                  }}
                  disabled={isSaving}
                  className="gap-1.5"
                >
                  <Save className="h-4 w-4" /> Guardar borrador
                </Button>
              )}
              <Button
                onClick={() => {
                  if (step < 4) {
                    if (!validateStep(step)) return;
                    setStep(step + 1);
                  } else {
                    // Validate all steps before publishing
                    const allValid = [1, 2, 3, 4].every((s) => validateStep(s));
                    if (!allValid) return;
                    onSave(buildPayload(), isEditing ? (initialData?.status || 'published') as 'draft' | 'published' : 'published');
                  }
                }}
                disabled={isSaving}
                className={cn(step === 4 && 'bg-emerald-600 hover:bg-emerald-700 gap-1.5')}
              >
                {step === 4 ? (
                  isEditing ? <><Save className="h-4 w-4" /> Guardar Cambios</> : <><Rocket className="h-4 w-4" /> Publicar Evento</>
                ) : 'Siguiente →'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
