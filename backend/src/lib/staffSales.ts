import { query } from '../config/database.js';

const TZ = 'America/Mexico_City';

/** Ejecutor inyectable: por defecto el `query` del pool; en tests se pasa el cliente de la tx. */
export type Executor = <T = any>(text: string, params?: any[]) => Promise<T[]>;

export interface StaffSalesRow {
  user_id: string;
  display_name: string;
  default_facility_id: string | null;
  memberships_count: number;          // TODAS las membresías atribuidas
  memberships_amount: number;
  public_memberships_count: number;   // solo planes is_active=true → COMISIONA
  public_memberships_amount: number;
  products_count: number;             // ventas en caja → NO comisiona
  products_amount: number;
}

export interface MembershipLine {
  payment_id: string;
  created_at: string;
  member_name: string;
  plan_name: string;
  amount: number;
  payment_method: string;
}
export interface ProductLine {
  sale_id: string;
  created_at: string;
  total: number;
  items: Array<{ product_name: string; quantity: number; unit_price: number }>;
}
export interface StaffSalesDetail {
  memberships: MembershipLine[];
  products: ProductLine[];
}

/**
 * Resumen por colaborador en el rango [from, to] (YYYY-MM-DD, inclusivo, CDMX).
 * `roles` filtra el conjunto de usuarios (default: solo 'reception').
 */
export async function getStaffSales(
  from: string,
  to: string,
  opts: { roles?: string[]; exec?: Executor } = {},
): Promise<StaffSalesRow[]> {
  const exec = opts.exec ?? query;
  const roles = opts.roles ?? ['reception'];
  const rows = await exec<any>(`
    WITH memb AS (
      SELECT pay.processed_by AS staff_id, COUNT(*) AS n, COALESCE(SUM(pay.amount),0) AS amount
      FROM payments pay
      WHERE pay.membership_id IS NOT NULL AND pay.status = 'completed'
        AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
      GROUP BY pay.processed_by
    ),
    pmemb AS (
      SELECT pay.processed_by AS staff_id, COUNT(*) AS n, COALESCE(SUM(pay.amount),0) AS amount
      FROM payments pay
      JOIN memberships m ON m.id = pay.membership_id
      JOIN plans pl ON pl.id = m.plan_id
      WHERE pay.membership_id IS NOT NULL AND pay.status = 'completed' AND pl.is_active = true
        AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
      GROUP BY pay.processed_by
    ),
    prod AS (
      SELECT seller_id AS staff_id, COUNT(*) AS n, COALESCE(SUM(total),0) AS amount
      FROM sales
      WHERE status <> 'cancelled'
        AND (created_at AT TIME ZONE '${TZ}')::date BETWEEN $1::date AND $2::date
      GROUP BY seller_id
    )
    SELECT u.id AS user_id, u.display_name, u.default_facility_id,
           COALESCE(memb.n,0)::int     AS memberships_count,
           COALESCE(memb.amount,0)::float  AS memberships_amount,
           COALESCE(pmemb.n,0)::int    AS public_memberships_count,
           COALESCE(pmemb.amount,0)::float AS public_memberships_amount,
           COALESCE(prod.n,0)::int     AS products_count,
           COALESCE(prod.amount,0)::float  AS products_amount
    FROM users u
    LEFT JOIN memb  ON memb.staff_id  = u.id
    LEFT JOIN pmemb ON pmemb.staff_id = u.id
    LEFT JOIN prod  ON prod.staff_id  = u.id
    WHERE u.role = ANY($3::text[]) AND u.is_active = true
    ORDER BY u.display_name
  `, [from, to, roles]);
  return rows as StaffSalesRow[];
}

/** Desglose línea-por-línea de un colaborador en [from, to]. */
export async function getStaffSalesDetail(
  staffId: string,
  from: string,
  to: string,
  opts: { exec?: Executor } = {},
): Promise<StaffSalesDetail> {
  const exec = opts.exec ?? query;
  const memberships = await exec<any>(`
    SELECT pay.id AS payment_id,
           TO_CHAR((COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS created_at,
           cu.display_name AS member_name,
           pl.name AS plan_name,
           pay.amount::float AS amount,
           pay.payment_method
    FROM payments pay
    JOIN memberships m ON m.id = pay.membership_id
    JOIN plans pl ON pl.id = m.plan_id AND pl.is_active = true
    JOIN users cu ON cu.id = pay.user_id
    WHERE pay.processed_by = $1 AND pay.membership_id IS NOT NULL AND pay.status = 'completed'
      AND (COALESCE(pay.completed_at, pay.created_at) AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
    ORDER BY 2 DESC, 1
  `, [staffId, from, to]);

  const products = await exec<any>(`
    SELECT s.id AS sale_id,
           TO_CHAR((s.created_at AT TIME ZONE '${TZ}')::date, 'YYYY-MM-DD') AS created_at,
           s.total::float AS total,
           COALESCE(
             json_agg(json_build_object('product_name', si.product_name, 'quantity', si.quantity, 'unit_price', si.unit_price::float))
               FILTER (WHERE si.id IS NOT NULL),
             '[]'
           ) AS items
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE s.seller_id = $1 AND s.status <> 'cancelled'
      AND (s.created_at AT TIME ZONE '${TZ}')::date BETWEEN $2::date AND $3::date
    GROUP BY s.id
    ORDER BY 2 DESC, 1
  `, [staffId, from, to]);

  return { memberships: memberships as MembershipLine[], products: products as ProductLine[] };
}
