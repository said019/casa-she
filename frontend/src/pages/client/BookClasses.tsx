import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { BookingClient } from "@/types/booking";
import Schedule from "@/components/Schedule";
import { ClientLayout } from "@/components/layout/ClientLayout";
import { AuthGuard } from "@/components/layout/AuthGuard";

export default function BookClasses() {
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
            <Schedule bookedIds={bookedIds} defaultFirstFacility />
          </div>
        </div>
      </ClientLayout>
    </AuthGuard>
  );
}
