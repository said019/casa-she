// Galería editorial de Casa Shé Condesa — fotos reales de la práctica y la comunidad.
// Mobile-first: en móvil es una columna con las proporciones naturales de cada foto
// (las leyendas se ven SIEMPRE, sin depender de hover); en escritorio una retícula
// editorial asimétrica de 6 columnas. Paleta bmb-cream/ink/gold, marcos rectos con
// borde fino de tinta (DESIGN.md).

const BANNER = {
  src: "/casashe/galeria/bakasana.webp",
  alt: "Bakasana sostenida en el salón de Casa Shé, luz de mañana entrando por los ventanales",
};

type Shot = { src: string; alt: string; tag: string; index: string; span: string };

// `span` aplica solo en la retícula de escritorio (md+). En móvil se ignora (es flex).
// El ritmo alterna verticales altas (retrato) con panorámicas y detalles cercanos.
const SHOTS: Shot[] = [
  {
    src: "/casashe/galeria/split-espejo.webp",
    alt: "Apertura de cadera frente al espejo luna del salón principal",
    tag: "Flex",
    index: "01",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    src: "/casashe/galeria/sonoterapia.webp",
    alt: "Cuencos tibetanos y armonio dispuestos para cerrar la práctica",
    tag: "Sonoterapia",
    index: "02",
    span: "md:col-span-4",
  },
  {
    src: "/casashe/galeria/barre-duo.webp",
    alt: "Dos alumnos trabajando alineación en la barra",
    tag: "Barre",
    index: "03",
    span: "md:col-span-2",
  },
  {
    src: "/casashe/galeria/perro-boca-abajo.webp",
    alt: "Perro boca abajo en fila sobre los tapetes verdes del salón",
    tag: "Yoga",
    index: "04",
    span: "md:col-span-2",
  },
  {
    src: "/casashe/galeria/comunidad.webp",
    alt: "El grupo completo al terminar la clase, frente al espejo",
    tag: "Comunidad",
    index: "05",
    span: "md:col-span-2 md:row-span-2",
  },
  {
    src: "/casashe/galeria/barre-perfil.webp",
    alt: "Trabajo de espalda en la barra, de perfil contra la cortina de lino",
    tag: "Barre",
    index: "06",
    span: "md:col-span-2",
  },
  {
    src: "/casashe/galeria/barra-manos.webp",
    alt: "Manos sujetando la barra a contraluz",
    tag: "Detalle",
    index: "07",
    span: "md:col-span-2",
  },
  {
    src: "/casashe/galeria/barra-tatuaje.webp",
    alt: "Brazo tatuado sosteniendo la barra durante la serie de piernas",
    tag: "Barre",
    index: "08",
    span: "md:col-span-4",
  },
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
        decoding="async"
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
            <span className="text-bmb-gold">Condesa</span>
          </h2>
          <p className="mt-3 max-w-xl font-body text-base text-bmb-ink/70">
            Luz cálida, espejos de luna y madera. Grupos pequeños donde la
            práctica se siente tuya y nadie pasa desapercibida.
          </p>
        </div>

        {/* Banner principal */}
        <figure className="group relative mt-8 overflow-hidden border border-bmb-ink/12 bg-bmb-paper sm:mt-10">
          <img
            src={BANNER.src}
            alt={BANNER.alt}
            loading="lazy"
            decoding="async"
            className="block h-[15rem] w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] sm:h-[22rem] lg:h-[30rem]"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bmb-ink/60 via-bmb-ink/5 to-transparent" />
          <figcaption className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-5 lg:p-7">
            <p className="font-heading text-xl italic text-bmb-cream sm:text-2xl lg:text-3xl">
              Pilates, Barre &amp; Yoga
            </p>
            <span className="editorial-caption text-bmb-cream/70">Condesa, CDMX</span>
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
