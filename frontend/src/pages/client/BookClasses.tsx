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
        <div className="space-y-5 pb-4">
          <section className="relative min-h-[17rem] overflow-hidden rounded-[1.5rem] bg-balance-dark text-balance-cream sm:min-h-[21rem]">
            <img
              src="/casashe/espacio-salon.jpg"
              alt="Salón de Casa Shé"
              className="absolute inset-0 h-full w-full object-cover object-center"
              loading="eager"
            />
            <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(22,38,26,.94)_0%,rgba(22,38,26,.72)_54%,rgba(22,38,26,.32)_100%)]" />
            <div className="relative flex min-h-[17rem] max-w-3xl flex-col justify-end p-6 sm:min-h-[21rem] sm:p-9 lg:p-12">
              <p className="editorial-caption text-balance-cream/68">Reservas · Casa Shé</p>
              <h1 className="mt-3 max-w-2xl font-heading text-4xl leading-[0.96] tracking-[-0.035em] text-balance-cream sm:text-6xl">
                Haz espacio para <span className="italic text-[#D6D5C2]">volver a ti.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-balance-cream/72 sm:text-base">
                Toca una clase disponible y tu lugar quedará reservado de inmediato.
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-balance-cream/20 pt-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-balance-cream/58">
                <span>Condesa</span>
                <span className="h-1 w-1 rounded-full bg-[#B4A248]" aria-hidden="true" />
                <span>Movimiento · comunidad · bienestar</span>
              </div>
            </div>
          </section>
          <Schedule
            variant="app"
            bookedIds={bookedIds}
            defaultFirstFacility
            onClassPick={reserveDirectly}
            bookingClassId={bookingMutation.isPending ? pendingClass?.id ?? null : null}
          />
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
