/**
 * test-aviso-carga-calendario — resumen que se manda al estudio después de una
 * carga masiva del calendario.
 *
 * El bug que originó esto: el 30 y 31 de agosto se cargó septiembre copiando
 * semanas, y en la copia venían 11 horarios que nadie impartía (Raúl los
 * miércoles, Roby los jueves y viernes, Ale los domingos). Nadie los vio porque
 * el sistema no le enseña a nadie lo que acaba de cargar. Una socia de TotalPass
 * reservó una de esas clases fantasma y el estudio se enteró por casualidad.
 *
 * El sistema NO puede saber cuál es la agenda real del estudio — esa verdad solo
 * la tienen las dueñas y las coaches. Así que el resumen no valida nada: pone el
 * patrón semanal recién cargado enfrente de quien sí sabe, antes de que las
 * clientas reserven.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { resumirCarga, type FilaCargada, type MetaCarga } from '../src/lib/aviso-carga-calendario.js';

const META: MetaCarga = {
    desde: '2026-09-01',
    hasta: '2026-09-30',
    creadas: 252,
    yaExistian: 0,
    omitidas: 0,
    origen: 'copia',
};

// ---------------------------------------------------------------------------
// Nada que anunciar
// ---------------------------------------------------------------------------
{
    // Copiar una semana que ya estaba cargada no crea nada. Mandar un WhatsApp
    // igual entrena al estudio a ignorar el aviso, que es como se pierde el
    // único que sí importaba.
    const sinCrear = resumirCarga(
        [{ dow: 1, hhmm: '07:00', clase: 'Barre', coach: 'Shelle' }],
        { ...META, creadas: 0, yaExistian: 53 },
    );
    assert.equal(sinCrear, null, 'sin clases creadas no se manda nada');
}

// ---------------------------------------------------------------------------
// Orden de los días: la semana del estudio empieza en lunes
// ---------------------------------------------------------------------------
{
    // En la BD domingo es 0, así que ordenar por el número crudo lo pone
    // primero. La agenda de papel empieza en lunes y termina en domingo; si el
    // mensaje no sigue ese orden, cotejarlo se vuelve un rompecabezas.
    const filas: FilaCargada[] = [
        { dow: 0, hhmm: '08:00', clase: 'Pilates Mat', coach: 'Isaí' },
        { dow: 1, hhmm: '07:00', clase: 'Power Abs', coach: 'Shelle' },
        { dow: 6, hhmm: '12:00', clase: 'Navakarana', coach: 'Pau' },
    ];
    const texto = resumirCarga(filas, META)!;

    const posLunes = texto.indexOf('Lunes');
    const posSabado = texto.indexOf('Sábado');
    const posDomingo = texto.indexOf('Domingo');

    assert.ok(posLunes > -1 && posSabado > -1 && posDomingo > -1, 'aparecen los tres días');
    assert.ok(posLunes < posSabado, 'lunes va antes que sábado');
    assert.ok(posSabado < posDomingo, 'domingo va al final, no al principio');
}

// ---------------------------------------------------------------------------
// El encabezado da el rango y los contadores
// ---------------------------------------------------------------------------
{
    const texto = resumirCarga(
        [{ dow: 1, hhmm: '07:00', clase: 'Barre', coach: 'Shelle' }],
        { ...META, creadas: 252, yaExistian: 4, omitidas: 2 },
    )!;

    assert.ok(texto.includes('2026-09-01'), 'trae la fecha inicial del rango');
    assert.ok(texto.includes('2026-09-30'), 'trae la fecha final del rango');
    assert.ok(texto.includes('252'), 'dice cuántas clases se crearon');
    assert.ok(texto.includes('4'), 'dice cuántas ya existían');
    assert.ok(texto.includes('2'), 'dice cuántas se omitieron');
}

// ---------------------------------------------------------------------------
// Dos clases a la misma hora: las dos se listan
// ---------------------------------------------------------------------------
{
    // Casa Shé corre dos salones en paralelo casi toda la mañana. Un resumen que
    // colapse la hora a una sola clase esconde justo la mitad del horario.
    const filas: FilaCargada[] = [
        { dow: 1, hhmm: '07:00', clase: 'Power Abs', coach: 'Shelle' },
        { dow: 1, hhmm: '07:00', clase: 'Yoga Dharma', coach: 'Regina' },
    ];
    const texto = resumirCarga(filas, META)!;

    assert.ok(texto.includes('Power Abs'), 'lista la primera clase de las 07:00');
    assert.ok(texto.includes('Yoga Dharma'), 'lista la segunda clase de las 07:00');
}

// ---------------------------------------------------------------------------
// Un horario sin instructor se señala, no se calla
// ---------------------------------------------------------------------------
{
    // En producción hubo celdas sin instructor asignado. Un renglón que solo
    // diga la clase se lee como si estuviera completo.
    const texto = resumirCarga(
        [{ dow: 1, hhmm: '07:00', clase: 'Barre', coach: null }],
        META,
    )!;

    assert.ok(/sin instructor/i.test(texto), 'marca el horario sin instructor');
}

// ---------------------------------------------------------------------------
// Un patrón enorme se corta y lo dice
// ---------------------------------------------------------------------------
{
    // WhatsApp parte los mensajes muy largos y el final se pierde. Cortar en
    // silencio es peor que no mandar: el estudio creería que revisó todo.
    const muchas: FilaCargada[] = [];
    for (let i = 0; i < 120; i++) {
        muchas.push({
            dow: (i % 7),
            hhmm: `${String(6 + (i % 14)).padStart(2, '0')}:00`,
            clase: `Clase ${i}`,
            coach: 'Shelle',
        });
    }
    const texto = resumirCarga(muchas, META)!;

    assert.ok(texto.length < 4000, 'el mensaje cabe en un WhatsApp');
    assert.ok(/faltan|se cort/i.test(texto), 'avisa que la lista quedó cortada');
}

// ---------------------------------------------------------------------------
// Nadie tiene que adivinar qué hacer con el mensaje
// ---------------------------------------------------------------------------
{
    const texto = resumirCarga(
        [{ dow: 1, hhmm: '07:00', clase: 'Barre', coach: 'Shelle' }],
        META,
    )!;
    assert.ok(/agenda/i.test(texto), 'pide cotejar contra la agenda del estudio');
}

// ---------------------------------------------------------------------------
// CABLEADO: que el aviso esté CONECTADO a las dos vías de carga
// ---------------------------------------------------------------------------
// Un aviso perfecto que nadie invoca es exactamente el bug que ya nos pasó con
// el retiro de TotalPass: función escrita, documentada y correcta, con cero
// llamadores, mientras el problema seguía vivo en producción. Las pruebas de
// arriba pasarían en verde todo ese tiempo. Éstas revisan el código fuente.
{
    const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const classes = readFileSync(join(SRC, 'routes/classes.ts'), 'utf8');

    assert.match(
        classes,
        /import\s*\{[^}]*avisarCargaCalendario[^}]*\}\s*from\s*['"][^'"]*aviso-carga-calendario\.js['"]/,
        'classes.ts debe importar avisarCargaCalendario',
    );

    // Las dos vías por las que se llena el calendario: generar desde la
    // plantilla y copiar una semana real. Septiembre entró por la segunda.
    const llamadas = classes.match(/avisarCargaCalendario\s*\(/g) ?? [];
    assert.ok(
        llamadas.length >= 2,
        `el aviso debe dispararse en las dos vías de carga (POST /generate y POST /copy-week); encontradas: ${llamadas.length}`,
    );
}

console.log('✅ test-aviso-carga-calendario: todas las pruebas pasaron');
