import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { ClientLayout } from '@/components/layout/ClientLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { useAuthStore } from '@/stores/authStore';
import api, { getErrorMessage } from '@/lib/api';
import { optimizeImage } from '@/lib/imageOptimization';
import type { UpdateProfileData, User } from '@/types/auth';
import { Link } from 'react-router-dom';
import { Camera, Loader2 } from 'lucide-react';

const profileSchema = z.object({
  displayName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z
    .string()
    .regex(/^\+52[0-9]{10}$/, 'Formato: +52 seguido de 10 dígitos')
    .optional()
    .or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  healthNotes: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

interface ProfileResponse {
  user: User;
}

export default function ProfileEdit() {
  const { toast } = useToast();
  const { user: authUser, updateUser } = useAuthStore();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ['profile', authUser?.id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${authUser?.id}`);
      return data;
    },
    enabled: Boolean(authUser?.id),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: authUser?.display_name || '',
      phone: authUser?.phone || '',
      dateOfBirth: authUser?.date_of_birth ? authUser.date_of_birth.slice(0, 10) : '',
      emergencyContactName: authUser?.emergency_contact_name || '',
      emergencyContactPhone: authUser?.emergency_contact_phone || '',
      healthNotes: authUser?.health_notes || '',
    },
  });

  useEffect(() => {
    if (data?.user) {
      reset({
        displayName: data.user.display_name || '',
        phone: data.user.phone || '',
        dateOfBirth: data.user.date_of_birth ? data.user.date_of_birth.slice(0, 10) : '',
        emergencyContactName: data.user.emergency_contact_name || '',
        emergencyContactPhone: data.user.emergency_contact_phone || '',
        healthNotes: data.user.health_notes || '',
      });
    }
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: async (payload: UpdateProfileData) => {
      const { data } = await api.put(`/users/${authUser?.id}`, payload);
      return data.user as User;
    },
    onSuccess: (updatedUser) => {
      updateUser(updatedUser);
      toast({ title: 'Perfil actualizado', description: 'Tus datos se guardaron correctamente.' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'No se pudo guardar',
        description: getErrorMessage(error),
      });
    },
  });

  const photoMutation = useMutation({
    mutationFn: async (file: File) => {
      const optimized = await optimizeImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.9 });
      const formData = new FormData();
      formData.append('photo', optimized, 'profile.jpg');
      const { data } = await api.post(`/users/${authUser?.id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data.user as User;
    },
    onSuccess: (updatedUser) => {
      updateUser(updatedUser);
      setPhotoPreview(null);
      queryClient.invalidateQueries({ queryKey: ['profile', authUser?.id] });
      toast({ title: 'Foto actualizada', description: 'Tu foto de perfil se guardó correctamente.' });
    },
    onError: (error) => {
      setPhotoPreview(null);
      toast({ variant: 'destructive', title: 'No se pudo subir la foto', description: getErrorMessage(error) });
    },
  });

  const handlePhotoSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Archivo inválido', description: 'Selecciona una imagen.' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Imagen muy grande', description: 'Máximo 10MB.' });
      return;
    }
    setPhotoPreview(URL.createObjectURL(file));
    photoMutation.mutate(file);
  };

  const currentPhoto = photoPreview || data?.user?.photo_url || authUser?.photo_url || undefined;
  const initials = (data?.user?.display_name || authUser?.display_name || '?')
    .split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  const handlePhoneChange = (event: ChangeEvent<HTMLInputElement>) => {
    let value = event.target.value;
    value = value.replace(/[^\d+]/g, '');
    if (!value.startsWith('+52') && value.length > 0) {
      if (value.startsWith('52')) {
        value = `+${value}`;
      } else if (value.startsWith('+')) {
        value = `+52${value.substring(1)}`;
      } else {
        value = `+52${value}`;
      }
    }
    if (value.length > 13) {
      value = value.substring(0, 13);
    }
    event.target.value = value;
    setValue('phone', value, { shouldValidate: true });
  };

  const onSubmit = (values: ProfileForm) => {
    if (!authUser?.id) return;
    const payload: UpdateProfileData = {
      displayName: values.displayName,
      phone: values.phone?.trim() ? values.phone : undefined,
      dateOfBirth: values.dateOfBirth || undefined,
      emergencyContactName: values.emergencyContactName || undefined,
      emergencyContactPhone: values.emergencyContactPhone || undefined,
      healthNotes: values.healthNotes || undefined,
    };
    mutation.mutate(payload);
  };

  return (
    <AuthGuard requiredRoles={['client']}>
      <ClientLayout>
        <div className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-heading font-bold">Editar perfil</h1>
              <p className="text-muted-foreground">Actualiza tus datos personales.</p>
            </div>
            <Button variant="ghost" asChild>
              <Link to="/app/profile">Volver</Link>
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Información personal</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
                  <div className="flex flex-col items-center gap-3 pb-2">
                    <div className="relative">
                      <Avatar className="h-24 w-24">
                        <AvatarImage src={currentPhoto} alt="Foto de perfil" />
                        <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                      </Avatar>
                      {photoMutation.isPending && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/70">
                          <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoSelect}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="default"
                      disabled={photoMutation.isPending}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      {photoMutation.isPending ? 'Subiendo...' : 'Cambiar foto'}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="displayName">Nombre completo</Label>
                    <Input id="displayName" {...register('displayName')} />
                    {errors.displayName && (
                      <p className="text-xs text-destructive">{errors.displayName.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Teléfono</Label>
                    <Input id="phone" {...register('phone', { onChange: handlePhoneChange })} />
                    {errors.phone && (
                      <p className="text-xs text-destructive">{errors.phone.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Fecha de nacimiento</Label>
                    <Input id="dateOfBirth" type="date" {...register('dateOfBirth')} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactName">Contacto de emergencia</Label>
                    <Input id="emergencyContactName" {...register('emergencyContactName')} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactPhone">Teléfono de emergencia</Label>
                    <Input id="emergencyContactPhone" {...register('emergencyContactPhone')} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="healthNotes">Notas de salud</Label>
                    <Textarea id="healthNotes" {...register('healthNotes')} rows={4} />
                  </div>

                  <Button type="submit" disabled={mutation.isPending}>
                    {mutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
