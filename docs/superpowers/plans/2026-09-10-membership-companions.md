# Invitadas por membresía

Política aprobada: ilimitadas incluyen una visita de invitada por ciclo mensual (aniversario de inicio, según fecha de clase), adicionales $280 MXN. Paquetes con créditos descuentan un crédito a la titular. Hasta dos invitadas activas por reserva; cada invitada ocupa su propio lugar.

Implementación:
1. Tabla aditiva de invitadas y recibos, cuota por ciclo, créditos y capacidad transaccionales. No modificar reservas históricas.
2. Registro desde detalle de reserva y calendario administrativo. Nombre y teléfono, estados y cancelación.
3. Checkout separado de membresías; solo pago verificado confirma lugar. Sin apartados impagados. Revalidar cupo, vigencia y titular; pagos imposibles o duplicados pasan a revisión sin sobreventa.
4. Cancelar primero invitadas antes que titular. Cancelaciones de clase conservan devoluciones existentes; cancelación oportuna restituye visita incluida. Pagos cancelados se revisan en recepción, sin devolución monetaria automática.
5. Revisiones independientes de especificación y calidad; pruebas PostgreSQL aisladas y frontend. Compilar antes de publicar.

Límite deliberado: no se automatiza una política monetaria de reembolso no definida por el estudio. Las devoluciones/contracargos ya confirmados por Mercado Pago sí se reflejan.
