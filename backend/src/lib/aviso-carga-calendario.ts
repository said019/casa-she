/**
 * aviso-carga-calendario — resumen al estudio de lo que quedó cargado tras una
 * carga masiva del calendario.
 *
 * El calendario de Casa Shé se llena a mano: alguien copia una semana o genera
 * desde la plantilla. El 30 y 31 de agosto se cargó septiembre así y en la carga
 * venían 11 horarios que nadie impartía. Nadie los vio, porque hasta ahora el
 * sistema no le enseñaba a nadie lo que acababa de cargar. Una socia de
 * TotalPass reservó una de esas clases fantasma y el estudio se enteró de
 * casualidad, semanas después.
 *
 * Este módulo NO valida el horario: el sistema no puede saber cuál es la agenda
 * real del estudio — esa verdad solo la tienen las dueñas y las coaches. Lo que
 * hace es poner el patrón semanal recién cargado enfrente de quien sí la sabe,
 * mientras todavía está haciendo el trabajo y antes de que las clientas reserven.
 *
 * Diseño en dos piezas, como el resto de los avisos del proyecto:
 *   1. `resumirCarga()` — pura, sin BD ni red. Es la que se prueba.
 *   2. `avisarCargaCalendario()` — el lado con I/O, best-effort: si WhatsApp
 *      falla NO se rompe la carga (las clases ya quedaron guardadas, que es lo
 *      que le importa al estudio).
 *
 * Configuración (Railway): `ADMIN_ALERT_WHATSAPP`, la misma que ya usan los
 * avisos de reservas de TotalPass. Sin ella, no hace nada y no truena.
 *
 * Este archivo NO importa nada en el nivel superior a propósito. La cadena de
 * WhatsApp arrastra la configuración de base de datos (`new Pool()` corre al
 * importar), y eso obligaría a levantar Postgres para probar un formateador de
 * texto. El emisor carga sus dependencias adentro, cuando de verdad va a mandar.
 */

/** Una franja del patrón semanal que quedó cargado. */
export interface FilaCargada {
    /** Día de la semana como lo guarda Postgres: 0 = domingo. */
    dow: number;
    /** "HH:MM" */
    hhmm: string;
    clase: string;
    coach: string | null;
}

export interface MetaCarga {
    /** "YYYY-MM-DD" */
    desde: string;
    /** "YYYY-MM-DD" */
    hasta: string;
    creadas: number;
    yaExistian: number;
    /** Saltadas por día cerrado o por caer en el pasado. */
    omitidas: number;
    origen: 'plantilla' | 'copia';
}

/**
 * La semana del estudio empieza en lunes. En la BD domingo es 0, así que
 * ordenar por el número crudo lo pondría primero y cotejar el mensaje contra la
 * agenda de papel se volvería un rompecabezas.
 */
const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0];

const NOMBRE_DIA: Record<number, string> = {
    1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves',
    5: 'Viernes', 6: 'Sábado', 0: 'Domingo',
};

/**
 * Tope de franjas listadas. WhatsApp parte los mensajes muy largos y el final se
 * pierde sin avisar; un corte silencioso es peor que no mandar nada, porque el
 * estudio creería que revisó todo el horario.
 */
const MAX_FRANJAS = 60;

/**
 * Arma el texto del aviso. Devuelve `null` cuando no hay nada que anunciar.
 *
 * Copiar una semana que ya estaba cargada no crea nada; mandar el WhatsApp igual
 * entrena al estudio a ignorar el aviso, que es justo como se pierde el único
 * que sí importaba.
 */
export function resumirCarga(filas: FilaCargada[], meta: MetaCarga): string | null {
    if (meta.creadas <= 0) return null;

    const porDia = new Map<number, FilaCargada[]>();
    for (const f of filas) {
        const lista = porDia.get(f.dow) ?? [];
        lista.push(f);
        porDia.set(f.dow, lista);
    }

    const comoSeCargo = meta.origen === 'plantilla'
        ? 'generado desde los horarios'
        : 'copiado de otra semana';

    const lineas: string[] = [
        `*Casa Shé — calendario cargado*`,
        `${meta.desde} a ${meta.hasta} (${comoSeCargo})`,
        `${meta.creadas} clases creadas · ${meta.yaExistian} ya existían · ${meta.omitidas} omitidas`,
        '',
        'Este es el horario que quedó. Cotéjalo contra la agenda del estudio:',
    ];

    let listadas = 0;
    let cortado = 0;

    for (const dow of ORDEN_DIAS) {
        const delDia = porDia.get(dow);
        if (!delDia?.length) continue;

        const restantes = MAX_FRANJAS - listadas;
        if (restantes <= 0) {
            cortado += delDia.length;
            continue;
        }

        const ordenadas = [...delDia].sort(
            (a, b) => a.hhmm.localeCompare(b.hhmm) || a.clase.localeCompare(b.clase),
        );
        const visibles = ordenadas.slice(0, restantes);
        cortado += ordenadas.length - visibles.length;

        lineas.push('', `*${NOMBRE_DIA[dow]}*`);
        for (const f of visibles) {
            lineas.push(`${f.hhmm}  ${f.clase} · ${f.coach ?? '⚠️ sin instructor'}`);
        }
        listadas += visibles.length;
    }

    if (cortado > 0) {
        lineas.push('', `…faltan ${cortado} franjas más. Revísalas completas en el panel de horarios.`);
    }

    return lineas.join('\n');
}

/**
 * Consulta el patrón semanal que quedó en el rango y manda el resumen al
 * WhatsApp del estudio.
 *
 * El patrón se lee de la BD en vez de acumularlo en cada ruta: las dos vías de
 * carga llevan contabilidades distintas (una cuenta inserciones, la otra lleva
 * un detalle por fila) y duplicar ese rastreo en ambas es justo donde se
 * desincronizan. Además así el resumen refleja lo que de verdad quedó en el
 * calendario, no lo que la ruta creyó haber escrito.
 *
 * Best-effort a propósito: la carga ya se guardó y no puede fallar por un
 * timeout del proveedor de mensajes. Llámala con `void`, sin esperar.
 */
export async function avisarCargaCalendario(
    meta: MetaCarga & { facilityId?: string | null },
): Promise<void> {
    try {
        if (meta.creadas <= 0) return;

        const [{ query }, { sendWhatsAppMessage }, { destinatariosWhatsApp }] = await Promise.all([
            import('../config/database.js'),
            import('./whatsapp.js'),
            import('./totalpass/alerta-admin.js'),
        ]);

        const destinos = destinatariosWhatsApp();
        if (!destinos.length) return;

        const filas = await query<FilaCargada>(
            `SELECT DISTINCT
                    EXTRACT(DOW FROM c.date)::int      AS dow,
                    substr(c.start_time::text, 1, 5)   AS hhmm,
                    ct.name                            AS clase,
                    i.display_name                     AS coach
               FROM classes c
               JOIN class_types ct ON ct.id = c.class_type_id
               LEFT JOIN instructors i ON i.id = c.instructor_id
              WHERE c.date BETWEEN $1::date AND $2::date
                AND c.status = 'scheduled'
                AND ($3::uuid IS NULL OR c.facility_id = $3::uuid)`,
            [meta.desde, meta.hasta, meta.facilityId ?? null],
        );

        const texto = resumirCarga(filas, meta);
        if (!texto) return;

        for (const telefono of destinos) {
            await sendWhatsAppMessage(telefono, texto)
                .catch((e: any) => console.error(`[aviso-carga] WhatsApp a ${telefono}:`, e?.message));
        }
    } catch (e: any) {
        console.error('[aviso-carga] no se pudo mandar el resumen:', e?.message);
    }
}
