// Galería editorial del espacio físico — fotos reales de la sucursal San Miguel.
// Mobile-first: en móvil es un carrusel con scroll-snap (las leyendas se ven SIEMPRE,
// sin depender de hover); en escritorio una retícula editorial asimétrica. Paleta
// bmb-cream/ink/gold, marcos rectos con borde fino de tinta (DESIGN.md).

const BANNER = {
  src: "/studio/reformers.webp",
  alt: "Reformers alineados frente al espejo luna en BMB Studio San Miguel",
};

type Shot = { src: string; alt: string; tag: string; index: string; span: string };

// `span` aplica solo en la retícula de escritorio (md+). En móvil se ignora (es flex).
const SHOTS: Shot[] = [
  { src: "/studio/reformers-vertical.webp", alt: "Camas reformer y espejo luna en BMB Studio San Miguel", tag: "Reformer", index: "01", span: "md:col-span-2 md:row-span-2" },
  { src: "/studio/recepcion.webp", alt: "Recepción de BMB Studio San Miguel con el logo dorado", tag: "Recepción", index: "02", span: "md:col-span-4" },
  { src: "/studio/barre.webp", alt: "Salón de barre con espejos en BMB Studio San Miguel", tag: "Barre", index: "03", span: "md:col-span-2" },
  { src: "/studio/ambiente.webp", alt: "Salón de BMB Studio San Miguel en luz cálida de ambiente", tag: "Ambiente", index: "04", span: "md:col-span-2" },
  { src: "/studio/salon.webp", alt: "Salón principal de BMB Studio San Miguel en luz de tarde", tag: "Salón", index: "05", span: "md:col-span-6" },
];

function Frame({ shot }: { shot: Shot }) {
  return (
    <figure
      className={`group relative w-full overflow-hidden border border-bmb-ink/12 bg-bmb-paper md:h-full md:w-auto ${shot.span}`}
    >
      <img
        src={shot.src}
        alt={shot.alt}
        loading="lazy"
        className="block h-auto w-full transition-transform duration-700 ease-out group-hover:scale-[1.05] md:h-full md:object-cover"
      />
      {/* Velo inferior siempre visible para que la leyenda se lea en cualquier foto. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bmb-ink/65 to-transparent" />
      <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3.5 pb-3">
        <span className="editorial-caption-sm text-bmb-cream">{shot.tag}</span>
        <span className="editorial-caption-sm tabular-nums text-bmb-cream/60">{shot.index}</span>
      </figcaption>
    </figure>
  );
}

export default function StudioGallery() {
  return (
    <section id="estudio" className="border-b border-bmb-ink/15 bg-bmb-cream py-16 sm:py-20 lg:py-24 scroll-mt-24">
      <div className="mx-auto max-w-[1440px] px-5 sm:px-8 lg:px-12">
        {/* Encabezado editorial */}
        <div className="border-b-2 border-bmb-ink pb-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="editorial-caption text-bmb-ink/45">El estudio</span>
            <span className="editorial-caption text-bmb-gold">N° 08</span>
          </div>
          <h2 className="mt-2 font-heading text-4xl italic text-bmb-ink lg:text-5xl">
            San <span className="text-bmb-gold">Miguel</span>
          </h2>
          <p className="mt-3 max-w-xl font-body text-base text-bmb-ink/70">
            Luz cálida, espejos de luna y reformers de madera. Un espacio pensado para
            que cada clase se sienta tuya.
          </p>
        </div>

        {/* Banner principal */}
        <figure className="group relative mt-8 overflow-hidden border border-bmb-ink/12 bg-bmb-paper sm:mt-10">
          <img
            src={BANNER.src}
            alt={BANNER.alt}
            loading="lazy"
            className="block h-[15rem] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] sm:h-[22rem] lg:h-[30rem]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bmb-ink/60 via-bmb-ink/5 to-transparent" />
          <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-5 lg:p-7">
            <p className="font-heading text-xl italic text-bmb-cream sm:text-2xl lg:text-3xl">
              Reformer &amp; Barre
            </p>
            <span className="editorial-caption text-bmb-cream/70">Cuautitlán Izcalli</span>
          </figcaption>
        </figure>

        {/* Móvil: columna vertical, cada foto a su proporción natural (sin recortes raros).
            Escritorio: retícula editorial asimétrica. Mismo markup, cambia a grid en md. */}
        <div className="mt-4 flex flex-col gap-3 md:mt-3 md:grid md:grid-cols-6 md:auto-rows-[11.5rem] md:gap-3 lg:auto-rows-[13.5rem]">
          {SHOTS.map((shot) => (
            <Frame key={shot.src} shot={shot} />
          ))}
        </div>
      </div>
    </section>
  );
}
