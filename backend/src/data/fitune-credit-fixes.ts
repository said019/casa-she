// Correcciones de créditos para reconciliar membresías migradas con Fitune (la migración del 14-jun
// quedó con créditos que ya no cuadran porque las clientas siguieron usando Fitune). Marcadas por recepción.
// Formato: [email, reformer_remaining, multi_remaining, classes_remaining(genérico)].
// La Migration 088 las aplica SOLO a la membresía con is_migration=true y status='active'. Run-once.
export const CREDIT_FIXES: Array<[string, number, number, number]> = [
  ['sofiduarted@gmail.com', 0, 2, 0], // Sofía Xanat — Fitune: Multiclases 3, 2 de 12 restantes (BMB tenía 8)
];
