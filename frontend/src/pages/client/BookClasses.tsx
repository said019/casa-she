import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { AxiosError } from "axios";
import api, { getErrorMessage } from "@/lib/api";
import type { BookingClient } from "@/types/booking";
import type { ScheduleClass } from "@/lib/schedule-state";
import { getCellStatus } from "@/lib/schedule-state";
import Schedule from "@/components/Schedule";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { ReglamentoGate } from "@/components/ReglamentoGate";
import { useAuthStore } from "@/stores/authStore";
import { useToast } from "@/components/ui/use-toast";

type BookingApiError = {
  code?: string;
  error?: string;
};

export default function BookClasses() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [pendingClass, setPendingClass] = useState<ScheduleClass | null>(null);
  const [regOpen, setRegOpen] = useState(false);

  const { data: myBookings } = useQuery<BookingClient[]>({
    queryKey: ["my-bookings"],
    queryFn: async () => (await api.get("/bookings/my-bookings")).data,
  });

  const bookedIds = useMemo(
    () =>
      new Set(
        (myBookings ?? [])
          .filter((b) => b.booking_status !== "cancelled")
          .map((b) => b.class_id)
          .filter(Boolean),
      ),
    [myBookings],
  );

  const bookingMutation = useMutation({
    mutationFn: async (classId: string) => api.post("/bookings", { classId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["public-classes"] });
      queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      queryClient.invalidateQueries({ queryKey: ["my-membership"] });
      setPendingClass(null);
      toast({
        title: "Reserva confirmada",
        description: "Tu lugar quedó apartado de inmediato. Te esperamos en Casa Shé.",
      });
      navigate("/app/classes");
    },
    onError: (err: AxiosError<BookingApiError>, classId) => {
      const code = err?.response?.data?.code;
      const message = err?.response?.data?.error;

      if (code === "REGLAMENTO_REQUIRED") {
        setRegOpen(true);
        return;
      }
      setPendingClass(null);
      if (code === "NEEDS_PURCHASE") {
        toast({
          title: "Necesitas créditos para reservar",
          description: "Te llevamos a comprar un paquete o membresía.",
        });
        navigate("/app/checkout");
        return;
      }
      if (message === "Clase llena") {
        toast({
          title: "La clase acaba de llenarse",
          description: "Puedes anotarte en la lista de espera.",
        });
        navigate(`/app/book/${classId}`);
        return;
      }
      toast({
        variant: "destructive",
        title: "No se pudo reservar",
        description: getErrorMessage(err),
      });
    },
  });

  const reserveDirectly = (classItem: ScheduleClass) => {
    const status = getCellStatus(classItem, new Date());

    if (status === "booked") {
      toast({ title: "Ya tienes esta clase reservada" });
      navigate("/app/classes");
      return;
    }
    if (status === "full") {
      navigate(`/app/book/${classItem.id}`);
      return;
    }
    if (status === "past" || status === "in-progress" || classItem.bookingClosed) {
      toast({
        variant: "destructive",
        title: "Esta clase ya no acepta reservas",
      });
      return;
    }
    if (bookingMutation.isPending) return;

    setPendingClass(classItem);
    if (user?.role === "client" && !user.reglamento_accepted_at) {
      setRegOpen(true);
      return;
    }
    bookingMutation.mutate(classItem.id);
  };

  const continueAfterRules = () => {
    if (pendingClass) bookingMutation.mutate(pendingClass.id);
  };

  return (
    <AuthGuard requiredRoles={["client"]}>
      <ClientLayout>
        <div className="-mx-4 sm:-mx-6 lg:-mx-8">
          <div className="landing-sans bg-bmb-cream min-h-screen">
            <div className="mx-auto max-w-[1440px] px-5 pt-10 sm:px-8 lg:px-12">
              <div className="flex items-baseline justify-between editorial-caption text-bmb-ink/55 border-b border-bmb-ink pb-3">
                <span>Reservar — horarios</span>
                <span>Casa Shé</span>
              </div>
            </div>
            <Schedule
              bookedIds={bookedIds}
              defaultFirstFacility
              onClassPick={reserveDirectly}
              bookingClassId={bookingMutation.isPending ? pendingClass?.id ?? null : null}
            />
          </div>
        </div>
        <ReglamentoGate
          open={regOpen}
          onOpenChange={setRegOpen}
          onAccepted={continueAfterRules}
        />
      </ClientLayout>
    </AuthGuard>
  );
}
