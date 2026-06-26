import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { AuthGuard } from '@/components/layout/AuthGuard';
import { useToast } from '@/hooks/use-toast';
import api, { getErrorMessage } from '@/lib/api';
import EventListView from './EventListView';
import EventDetailView from './EventDetailView';
import CreateEventView from './CreateEventView';
import type { StudioEvent, EventView } from './types';

export default function EventsManager() {
  const [view, setView] = useState<EventView | 'edit'>('list');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all events (admin endpoint includes registrations)
  const { data: events = [], isLoading } = useQuery<StudioEvent[]>({
    queryKey: ['admin-events'],
    queryFn: async () => (await api.get('/events/admin/all')).data,
  });

  // Always derive selected event from fresh query data
  const selectedEvent = selectedEventId ? events.find(e => e.id === selectedEventId) || null : null;

  // Create event mutation
  const createMutation = useMutation({
    mutationFn: async (payload: { data: any; status: 'draft' | 'published' }) => {
      return (await api.post('/events', { ...payload.data, status: payload.status })).data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      toast({
        title: variables.status === 'draft' ? 'Borrador guardado' : '¡Evento publicado!',
        description:
          variables.status === 'draft'
            ? 'Tu evento se guardó como borrador. Puedes publicarlo cuando quieras.'
            : 'Tu evento ya está visible para tus usuarios.',
      });
      setView('list');
    },
    onError: (error) => {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // Update event mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return (await api.put(`/events/${id}`, data)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      toast({ title: 'Evento actualizado' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // Delete event mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return (await api.delete(`/events/${id}`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      toast({ title: 'Evento eliminado' });
      handleBack();
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo eliminar', variant: 'destructive' });
    },
  });

  // Update registration status mutation
  const updateRegMutation = useMutation({
    mutationFn: async ({ eventId, regId, status }: { eventId: string; regId: string; status: string }) => {
      return (await api.put(`/events/${eventId}/registrations/${regId}`, { status })).data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      const label = variables.status === 'confirmed' ? 'confirmada' : variables.status === 'cancelled' ? 'cancelada' : 'actualizada';
      toast({ title: `Inscripción ${label}` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo actualizar la inscripción', variant: 'destructive' });
    },
  });

  // Check-in mutation
  const checkinMutation = useMutation({
    mutationFn: async ({ eventId, regId }: { eventId: string; regId: string }) => {
      return (await api.post(`/events/${eventId}/checkin/${regId}`)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      toast({ title: 'Check-in exitoso' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'No se pudo realizar el check-in', variant: 'destructive' });
    },
  });

  const handleSelect = (event: StudioEvent) => {
    setSelectedEventId(event.id);
    setView('detail');
  };

  const handleBack = () => {
    setView('list');
    setSelectedEventId(null);
  };

  const handleSave = (formData: any, status: 'draft' | 'published') => {
    createMutation.mutate({ data: formData, status });
  };

  const handleUpdateStatus = (eventId: string, status: string) => {
    updateMutation.mutate({ id: eventId, data: { status } });
  };

  const handleDelete = (eventId: string) => {
    deleteMutation.mutate(eventId);
  };

  const handleUpdateRegistration = (eventId: string, regId: string, status: string) => {
    updateRegMutation.mutate({ eventId, regId, status });
  };

  const handleCheckin = (eventId: string, regId: string) => {
    checkinMutation.mutate({ eventId, regId });
  };

  const handleUpdateConfig = (eventId: string, config: Record<string, boolean>) => {
    // Map camelCase keys to snake_case for API
    const keyMap: Record<string, string> = {
      waitlistEnabled: 'waitlist_enabled',
      requiredPayment: 'required_payment',
      walletPass: 'wallet_pass',
      autoReminders: 'auto_reminders',
      allowCancellations: 'allow_cancellations',
    };
    const payload: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(config)) {
      payload[keyMap[key] || key] = value;
    }
    updateMutation.mutate({ id: eventId, data: payload });
  };

  // Notify event mutation
  const notifyMutation = useMutation({
    mutationFn: async (eventId: string) => {
      return (await api.post('/events/notify', { eventId })).data;
    },
    onSuccess: (data) => {
      toast({ title: 'Notificación enviada', description: `Email enviado a ${data.sent} usuarios` });
    },
    onError: (error) => {
      toast({ title: 'Error', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const handleNotify = (eventId: string) => {
    notifyMutation.mutate(eventId);
  };

  const handleEdit = (event: StudioEvent) => {
    setSelectedEventId(event.id);
    setView('edit');
  };

  const handleEditSave = (formData: any, status: 'draft' | 'published') => {
    if (!selectedEvent) return;
    updateMutation.mutate(
      { id: selectedEvent.id, data: { ...formData, status } },
      {
        onSuccess: () => {
          setView('list');
          setSelectedEventId(null);
        },
      }
    );
  };

  return (
    <AuthGuard requiredRoles={['admin']}>
      <AdminLayout>
        <div className="space-y-6">
          {view === 'list' && (
            <EventListView
              events={events}
              isLoading={isLoading}
              onSelect={handleSelect}
              onCreateNew={() => setView('create')}
            />
          )}
          {view === 'detail' && selectedEvent && (
            <EventDetailView
              event={selectedEvent}
              onBack={handleBack}
              onEdit={handleEdit}
              onUpdateStatus={handleUpdateStatus}
              onDelete={handleDelete}
              onUpdateRegistration={handleUpdateRegistration}
              onCheckin={handleCheckin}
              onUpdateConfig={handleUpdateConfig}
              onNotify={handleNotify}
              isNotifying={notifyMutation.isPending}
            />
          )}
          {(view === 'create' || view === 'edit') && (
            <CreateEventView
              onBack={handleBack}
              onSave={view === 'edit' ? handleEditSave : handleSave}
              isSaving={view === 'edit' ? updateMutation.isPending : createMutation.isPending}
              initialData={view === 'edit' ? selectedEvent : null}
            />
          )}
        </div>
      </AdminLayout>
    </AuthGuard>
  );
}
