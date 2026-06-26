import { z } from 'zod';

export const ManualIncomeSchema = z.object({
    amount: z.coerce.number().positive('Monto inválido'),
    currency: z.string().min(3).max(3).default('MXN'),
    concept: z.string().min(1, 'Concepto requerido').max(255),
    paymentMethod: z.enum(['cash', 'transfer', 'card', 'online']),
    facilityId: z.string().uuid().optional(),
    incomeDate: z.string().optional(),
    notes: z.string().optional(),
});

export type ManualIncomeInput = z.infer<typeof ManualIncomeSchema>;
