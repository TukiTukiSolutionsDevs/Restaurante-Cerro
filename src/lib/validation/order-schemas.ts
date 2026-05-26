import { z } from 'zod';

const itemVariants = [
  'full_combo',
  'only_starter',
  'only_main',
  'drink_extra',
  'dessert_extra',
] as const;

const OrderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  variant: z.enum(itemVariants),
  quantity: z.number().int().min(1).max(10),
  withTupper: z.boolean().default(false),
});

export const CreateOrderSchema = z
  .object({
    orderType: z.enum(['dine_in', 'takeaway']),
    tableId: z.number().int().positive().nullable().optional(),
    items: z.array(OrderItemSchema).min(1).max(20),
  })
  .superRefine((data, ctx) => {
    if (data.orderType === 'dine_in' && !data.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tableId es requerido para pedidos en sala',
        path: ['tableId'],
      });
    }
    if (data.orderType === 'takeaway' && data.tableId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'tableId no aplica para pedidos para llevar',
        path: ['tableId'],
      });
    }
  });

export const PatchItemsSchema = z.object({
  items: z.array(OrderItemSchema).min(1).max(20),
});

export type CreateOrderBody = z.infer<typeof CreateOrderSchema>;
export type PatchItemsBody = z.infer<typeof PatchItemsSchema>;
