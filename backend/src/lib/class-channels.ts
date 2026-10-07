/**
 * Cupo y reservas de cada plataforma en una clase, como arreglo JSON: un elemento
 * por fila de channel_inventory, ordenado por canal; [] si no hay filas.
 * Es un fragmento de SELECT: espera la clase con alias `c`.
 */
export const CANALES_DE_CLASE_SQL = `COALESCE((
            SELECT json_agg(json_build_object('channel', cc.channel, 'max', cc.max_spots, 'booked', cc.booked_spots) ORDER BY cc.channel)
              FROM channel_inventory cc
             WHERE cc.class_id = c.id
        ), '[]'::json)`;

/** Un elemento de `channels` en GET /api/classes. */
export interface CanalDeClase {
    channel: string;
    max: number;
    booked: number;
}
