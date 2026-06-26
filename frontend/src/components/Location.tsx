const BRANCHES = [
  {
    label: "Nuestra sede",
    name: "Condesa",
    address: "Alfonso Reyes 131, Condesa, 06140 Ciudad de México, CDMX",
    hours: ["Lun–Vie · 06:30–21:00", "Sáb–Dom · 08:00–14:00"],
    mapsUrl: "https://www.google.com/maps/search/Casa+Sh%C3%A9+Condesa+CDMX",
  },
];

export default function Location() {
  return (
    <section className="border-b border-bmb-ink/15 bg-bmb-cream py-20 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="border-b-2 border-bmb-ink pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="editorial-caption text-bmb-ink/45">Visítanos</span>
            <span className="editorial-caption text-bmb-gold">N° 09</span>
          </div>
          <h2 className="mt-2 font-heading text-4xl italic text-bmb-ink lg:text-5xl">Ubicación</h2>
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-2">
          {BRANCHES.map((b) => (
            <article key={b.name}>
              <p className="editorial-caption text-bmb-ink/55">{b.label}</p>
              <h3 className="mt-1 font-heading italic text-5xl text-bmb-ink">{b.name}</h3>

              {/* Mapa real de Google (embed sin API key, por dirección) */}
              <div className="mt-5 overflow-hidden border border-bmb-ink/15 bg-bmb-paper">
                <iframe
                  title={`Mapa de Casa Shé ${b.name}`}
                  src={`https://www.google.com/maps?q=${encodeURIComponent(b.address)}&output=embed`}
                  className="block h-64 w-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  allowFullScreen
                />
              </div>

              <p className="mt-4 font-body text-base text-bmb-ink/80">{b.address}</p>
              <a
                href={b.mapsUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center font-heading italic text-base text-bmb-deepgold hover:text-bmb-gold"
              >
                Cómo llegar →
              </a>

              <div className="mt-5 editorial-rule-dotted" />
              <div className="mt-4 grid gap-1 font-body text-sm text-bmb-ink/75 tabular-nums">
                {b.hours.map((h) => <p key={h}>{h}</p>)}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
