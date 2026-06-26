const QUOTES = [
  { body: "Volví al studio después de 8 meses y sentí que nadie se había movido — todo seguía siendo igual de cuidado.", author: "Ana", since: "socia desde 2024" },
  { body: "Reservar es lo más rápido que hago en el día. Y la práctica, lo más importante.", author: "Mariana", since: "socia desde 2023" },
  { body: "El equipo te conoce. Saben tus límites y los empujan exactamente lo que necesitas.", author: "Carla", since: "socia desde 2025" },
];

export default function Testimonials() {
  return (
    <section className="border-b border-bmb-ink/15 bg-bmb-paper py-20 lg:py-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        <div className="border-b-2 border-bmb-ink pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="editorial-caption text-bmb-ink/45">Comunidad</span>
            <span className="editorial-caption text-bmb-gold">N° 07</span>
          </div>
          <h2 className="mt-2 font-heading text-4xl italic text-bmb-ink lg:text-5xl">Voces</h2>
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-3">
          {QUOTES.map((q) => (
            <figure key={q.author} className="relative pl-8">
              <span
                aria-hidden
                className="absolute left-0 -top-2 font-heading text-6xl text-bmb-gold leading-none"
              >
                ❝
              </span>
              <blockquote className="font-heading italic text-xl text-bmb-ink/85 leading-relaxed">
                {q.body}
              </blockquote>
              <figcaption className="mt-4 editorial-caption-sm text-bmb-ink/55">
                {q.author} — {q.since}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
