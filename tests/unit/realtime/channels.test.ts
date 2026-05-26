import { describe, expect, it } from 'vitest';

import {
  ChannelSchemas,
  MenuChangedSchema,
  OrderStatusChangedSchema,
  TableChangedSchema,
} from '@/lib/realtime/channels';

const VALID_UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('MenuChangedSchema', () => {
  it('parses a valid payload without entityId', () => {
    const result = MenuChangedSchema.parse({ menuId: 1, changeType: 'item_added' });
    expect(result).toEqual({ menuId: 1, changeType: 'item_added' });
  });

  it('throws for non-positive menuId', () => {
    expect(() => MenuChangedSchema.parse({ menuId: -1, changeType: 'item_added' })).toThrow();
  });

  it('throws for zero menuId', () => {
    expect(() => MenuChangedSchema.parse({ menuId: 0, changeType: 'item_added' })).toThrow();
  });

  it('throws for invalid changeType', () => {
    expect(() => MenuChangedSchema.parse({ menuId: 1, changeType: 'invalid_type' })).toThrow();
  });

  it('parses a valid payload with optional entityId', () => {
    const result = MenuChangedSchema.parse({ menuId: 2, changeType: 'availability_toggled', entityId: 5 });
    expect(result.entityId).toBe(5);
  });
});

describe('OrderStatusChangedSchema', () => {
  it('throws for non-uuid orderId', () => {
    expect(() =>
      OrderStatusChangedSchema.parse({
        orderId: 'not-a-uuid',
        from: 'pending',
        to: 'paid',
        shortCode: 'A3F7',
        tableId: 7,
      }),
    ).toThrow();
  });

  it('parses a valid dine-in payload', () => {
    const result = OrderStatusChangedSchema.parse({
      orderId: VALID_UUID,
      from: 'pending',
      to: 'paid',
      shortCode: 'A3F7',
      tableId: 7,
    });
    expect(result.orderId).toBe(VALID_UUID);
    expect(result.tableId).toBe(7);
  });

  it('parses a valid takeaway payload with tableId null', () => {
    const result = OrderStatusChangedSchema.parse({
      orderId: VALID_UUID,
      from: 'pending',
      to: 'paid',
      shortCode: 'A3F7',
      tableId: null,
    });
    expect(result.tableId).toBeNull();
  });

  it('throws for shortCode with wrong length', () => {
    expect(() =>
      OrderStatusChangedSchema.parse({
        orderId: VALID_UUID,
        from: 'pending',
        to: 'paid',
        shortCode: 'TOOLONG',
        tableId: null,
      }),
    ).toThrow();
  });

  it('throws for invalid status enum in from', () => {
    expect(() =>
      OrderStatusChangedSchema.parse({
        orderId: VALID_UUID,
        from: 'unknown_status',
        to: 'paid',
        shortCode: 'A3F7',
        tableId: null,
      }),
    ).toThrow();
  });
});

describe('TableChangedSchema', () => {
  it('parses a payload with only change — tableId and groupId both optional', () => {
    const result = TableChangedSchema.parse({ change: 'joined' });
    expect(result.change).toBe('joined');
    expect(result.tableId).toBeUndefined();
    expect(result.groupId).toBeUndefined();
  });

  it('parses a payload with tableId and groupId present', () => {
    const result = TableChangedSchema.parse({ tableId: 3, groupId: 10, change: 'created' });
    expect(result.tableId).toBe(3);
    expect(result.groupId).toBe(10);
  });

  it('throws for invalid change enum', () => {
    expect(() => TableChangedSchema.parse({ change: 'dissolved' })).toThrow();
  });
});

describe('ChannelSchemas registry', () => {
  it('has exactly the expected channel keys in order', () => {
    expect(Object.keys(ChannelSchemas)).toEqual([
      'menu_changed',
      'order_status_changed',
      'table_changed',
    ]);
  });
});
