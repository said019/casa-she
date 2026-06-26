/**
 * 👤 FORMULARIO: Cliente Nuevo (Sin membresía)
 *
 * Formulario simple para crear cuenta de cliente nuevo.
 * No incluye membresía - eso se hace después mediante venta normal.
 * Incluye buscador de clientes existentes para autocompletar datos.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Loader2, UserPlus, Info, Search, UserCheck, X } from 'lucide-react';
import api from '@/lib/api';
import { useIsElevated } from '@/hooks/useIsElevated';

const newClientSchema = z.object({
  displayName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  phone: z.string().min(8, 'Teléfono inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
  acceptsCommunications: z.boolean().default(false),
  // admin/master: de qué WhatsApp (sucursal) sale la bienvenida con credenciales.
  whatsappKey: z.enum(['san-miguel', 'tepa']).optional(),
});

type NewClientForm = z.infer<typeof newClientSchema>;

interface ExistingClient {
  id: string;
  display_name: string;
  email: string;
  phone: string;
}

interface NewClientFormProps {
  onSubmit: (data: NewClientForm) => void;
  isLoading?: boolean;
  onCancel?: () => void;
}

export const NewClientForm = ({ onSubmit, isLoading, onCancel }: NewClientFormProps) => {
  const isElevated = useIsElevated();
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<NewClientForm>({
    resolver: zodResolver(newClientSchema),
    defaultValues: {
      acceptsCommunications: false,
      whatsappKey: 'san-miguel',
    },
  });

  const acceptsCommunications = watch('acceptsCommunications');
  const whatsappKey = watch('whatsappKey');

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<ExistingClient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ExistingClient | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchClients = useCallback(async (term: string) => {
    if (term.length < 2) {
      setSearchResults([]);
      setShowResults(false);
      return;
    }
    setIsSearching(true);
    try {
      const { data } = await api.get('/users', {
        params: { search: term, role: 'client', limit: 5 },
      });
      setSearchResults(data.users || []);
      setShowResults(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchClients(value), 400);
  };

  const handleSelectClient = (client: ExistingClient) => {
    setSelectedClient(client);
    setShowResults(false);
    setSearchTerm('');
    // Auto-fill form
    setValue('displayName', client.display_name);
    setValue('email', client.email);
    setValue('phone', client.phone);
  };

  const handleClearSelection = () => {
    setSelectedClient(null);
    reset({ acceptsCommunications: false });
  };

  useEffect(() => {
    register('acceptsCommunications');
    register('whatsappKey');
  }, [register]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>Usuario Nuevo:</strong> Solo se creará la cuenta del usuario.
          Para asignarle una membresía, deberás realizar una venta desde "Ventas" o activar
          una membresía manualmente desde "Membresías".
          Al crear el usuario, se le enviará un <strong>correo y WhatsApp</strong> con sus datos de acceso.
        </AlertDescription>
      </Alert>

      {/* Buscador de clientes existentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Buscar usuario existente
          </CardTitle>
          <CardDescription>
            Busca por nombre, email o teléfono para autocompletar los datos
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedClient ? (
            <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{selectedClient.display_name}</span>
                <span className="text-xs text-muted-foreground">({selectedClient.email})</span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={handleClearSelection}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div ref={searchRef} className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, email o teléfono..."
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-9"
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {showResults && searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-lg">
                  {searchResults.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors first:rounded-t-md last:rounded-b-md"
                      onClick={() => handleSelectClient(client)}
                    >
                      <UserCheck className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{client.display_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {client.email} · {client.phone}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showResults && searchResults.length === 0 && searchTerm.length >= 2 && !isSearching && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover p-3 shadow-lg">
                  <p className="text-sm text-muted-foreground text-center">No se encontraron usuarios</p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Datos personales
          </CardTitle>
          <CardDescription>
            Información básica del nuevo usuario
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="displayName">
              Nombre completo <span className="text-destructive">*</span>
            </Label>
            <Input
              id="displayName"
              placeholder="Nombre y apellido"
              {...register('displayName')}
            />
            {errors.displayName && (
              <p className="text-xs text-destructive">{errors.displayName.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">
              Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              placeholder="correo@ejemplo.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">
              Teléfono <span className="text-destructive">*</span>
            </Label>
            <Input
              id="phone"
              placeholder="+52 33 1234 5678"
              {...register('phone')}
            />
            {errors.phone && (
              <p className="text-xs text-destructive">{errors.phone.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">
              Fecha de nacimiento
            </Label>
            <Input
              id="dateOfBirth"
              type="date"
              {...register('dateOfBirth')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">
              Contraseña temporal (opcional)
            </Label>
            <Input
              id="password"
              type="text"
              placeholder="Se generará automáticamente si se deja vacío"
              {...register('password')}
            />
            {errors.password && (
              <p className="text-xs text-destructive">{errors.password.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Si no especificas una, se generará una contraseña temporal aleatoria
            </p>
          </div>

          <div className="md:col-span-2 flex items-start gap-3 rounded-lg border p-4">
            <Checkbox
              id="acceptsCommunications"
              checked={acceptsCommunications}
              onCheckedChange={(checked) => setValue('acceptsCommunications', checked === true)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label
                htmlFor="acceptsCommunications"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                Acepta recibir comunicaciones
              </Label>
              <p className="text-sm text-muted-foreground">
                El usuario autoriza recibir notificaciones de WhatsApp, correo y SMS
              </p>
            </div>
          </div>

          {isElevated && (
            <div className="md:col-span-2 space-y-2">
              <Label>Enviar la bienvenida por el WhatsApp de</Label>
              <ToggleGroup
                type="single"
                value={whatsappKey || 'san-miguel'}
                onValueChange={(v) => { if (v === 'san-miguel' || v === 'tepa') setValue('whatsappKey', v); }}
                className="justify-start gap-1"
              >
                <ToggleGroupItem value="san-miguel" size="sm" className="text-xs px-3">San Miguel</ToggleGroupItem>
                <ToggleGroupItem value="tepa" size="sm" className="text-xs px-3">Tepa</ToggleGroupItem>
              </ToggleGroup>
              <p className="text-xs text-muted-foreground">Las credenciales de acceso se mandan desde este número.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
            Cancelar
          </Button>
        )}
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Crear usuario
        </Button>
      </div>
    </form>
  );
};
