import { z } from 'zod';

export const MenuChangedSchema = z.object({
  menuId: z.number().int().positive(),
  changeType: z.enum([
    'item_added',
    'item_updated',
    'availability_toggled',
    'combo_updated',
    'menu_opened',
    'menu_closed',
  ]),
  entityId: z.number().int().positive().optional(),
  shiftNumber: z.number().int().positive().optional(),
});
export type MenuChangedPayload = z.infer<typeof MenuChangedSchema>;

export const OrderStatusChangedSchema = z.object({
  orderId: z.string().uuid(),
  from: z.enum(['pending', 'paid', 'in_kitchen', 'delivered', 'cancelled']),
  to: z.enum(['pending', 'paid', 'in_kitchen', 'delivered', 'cancelled']),
  shortCode: z.string().length(4),
  tableId: z.number().int().positive().nullable(),
});
export type OrderStatusChangedPayload = z.infer<typeof OrderStatusChangedSchema>;

export const TableChangedSchema = z.object({
  tableId: z.number().int().positive().optional(),
  groupId: z.number().int().positive().optional(),
  change: z.enum(['created', 'updated', 'joined', 'split', 'state_changed', 'deactivated']),
});
export type TableChangedPayload = z.infer<typeof TableChangedSchema>;

export const ChannelSchemas = {
  menu_changed: MenuChangedSchema,
  order_status_changed: OrderStatusChangedSchema,
  table_changed: TableChangedSchema,
} as const;

export type Channel = keyof typeof ChannelSchemas;
export type ChannelPayloadMap = {
  menu_changed: MenuChangedPayload;
  order_status_changed: OrderStatusChangedPayload;
  table_changed: TableChangedPayload;
};

export const NOTIFY_PAYLOAD_MAX_BYTES = 7900;
