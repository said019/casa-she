import { syncUserLoyaltyPointsSnapshot } from './loyalty.js';

// Gasta N puntos por una orden de barra, DENTRO de la transacción (client de pool.connect()).
export async function spendBarPoints(client: any, userId: string, points: number, barOrderId: string): Promise<void> {
  await client.query(
    `INSERT INTO loyalty_points (user_id, points, type, description)
     VALUES ($1, $2, 'redemption', $3)`,
    [userId, -Math.abs(points), `Barra: orden ${barOrderId}`]);
  await syncUserLoyaltyPointsSnapshot(userId, client);
}

// Reintegra N puntos al cancelar una orden de barra pagada con puntos.
export async function refundBarPoints(client: any, userId: string, points: number, barOrderId: string): Promise<void> {
  await client.query(
    `INSERT INTO loyalty_points (user_id, points, type, description)
     VALUES ($1, $2, 'bonus', $3)`,
    [userId, Math.abs(points), `Reembolso barra: orden ${barOrderId}`]);
  await syncUserLoyaltyPointsSnapshot(userId, client);
}
