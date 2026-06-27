import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { TEAM_HERO_PHOTO } from "@/data/coaches";
import { CoachSheet } from "@/components/CoachSheet";

interface ApiInstructor {
  id: string;
  display_name: string;
  photo_url?: string | null;
  specialties?: unknown;
  tagline?: string | null;
  bio?: string | null;
}

// `specialties` puede venir como array (JSONB) o como string JSON; normaliza a string[].
function parseSpecialties(s: unknown): string[] {
  if (Array.isArray(s)) return s.filter((x): x is string => typeof x === "string");
  if (typeof s === "string" && s.trim()) {
    try {
      const p = JSON.parse(s);
      return Array.isArray(p) ? p.filter((x) => typeof x === "string") : [s];
    } catch {
      return [s];
    }
  }
  return [];
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export default function Instructors() {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);
  const [openName, setOpenName] = useState<string | null>(null);

  // Fuente de verdad: el roster PÚBLICO que administra el admin (GET /instructors ya filtra
  // is_active AND visible_public). Lo que el admin guarda — foto, bio, especialidades y la
  // visibilidad — se refleja aquí automáticamente, sin tocar código.
  const { data: instructors = [] } = useQuery<ApiInstructor[]>({
    queryKey: ["public-instructors"],
    queryFn: async () => (await api.get("/instructors")).data,
    staleTime: 1000 * 60 * 10,
  });

  // Todo editable desde el admin: el rol sale de las especialidades y la frase del tagline.
  // Sin lista hardcodeada — lo que el admin guarda se refleja aquí.
  const cards = useMemo(
    () =>
      instructors.map((i) => {
        const specs = parseSpecialties(i.specialties);
        const tagline = typeof i.tagline === "string" && i.tagline.trim() ? i.tagline.trim() : undefined;
        return {
          id: i.id,
          name: i.display_name,
          photo: i.photo_url || undefined,
          role: specs.slice(0, 2).join(" & ") || "Coach",
          tagline,
        };
      }),
    [instructors]
  );

  return (
    <section id="equipo" className="scroll-mt-24 border-b border-bmb-ink/15 bg-bmb-cream py-20 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="border-b-2 border-bmb-ink pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="editorial-caption text-bmb-ink/45">Quiénes te guían</span>
            {cards.length > 0 && (
              <span className="editorial-caption text-bmb-gold">{cards.length} coaches</span>
            )}
          </div>
          <h2 className="mt-2 font-heading text-4xl italic text-bmb-ink lg:text-5xl">El Equipo</h2>
        </div>

        {/* Group hero photo */}
        <figure className="relative mt-8 aspect-[16/7] overflow-hidden">
          <img
            src={TEAM_HERO_PHOTO}
            alt="El equipo de Casa Shé"
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
          <figcaption className="absolute bottom-3 left-4 font-heading italic text-base text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]">
            — Condesa, CDMX —
          </figcaption>
        </figure>

        {/* Roster grid — datos en vivo del admin. Tocar una tarjeta abre la bio del coach. */}
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 items-start sm:grid-cols-3 lg:grid-cols-6">
          {cards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setOpenId(c.id);
                setOpenName(c.name);
              }}
              className="group block text-left"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                {c.photo ? (
                  <img
                    src={c.photo}
                    alt={c.name}
                    className="h-full w-full object-cover object-top transition-transform duration-200 group-hover:translate-y-1 group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[linear-gradient(135deg,#ECE1CE_0%,#D6D5C2_100%)] transition-transform duration-200 group-hover:scale-[1.02]">
                    <span className="font-heading text-5xl font-medium leading-none text-bmb-ink/25">
                      {initials(c.name)}
                    </span>
                    <span className="editorial-caption-sm text-bmb-ink/40">Foto pronto</span>
                  </div>
                )}
                <span className="pointer-events-none absolute inset-0 bg-bmb-ink/0 transition-colors group-hover:bg-bmb-ink/10" />
              </div>
              <div className="mt-3 text-center">
                <p className="font-heading italic text-lg text-bmb-ink">{c.name}</p>
                <p className="editorial-caption-sm text-bmb-ink/55 mt-0.5">{c.role}</p>
                {c.tagline && (
                  <p className="mt-1 px-1 text-xs italic leading-snug text-bmb-ink/45">{c.tagline}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <CoachSheet
        instructorId={openId}
        instructorName={openName}
        onClose={() => {
          setOpenId(null);
          setOpenName(null);
        }}
        onPickClass={(classId) => navigate(`/app/book/${classId}`)}
      />
    </section>
  );
}
