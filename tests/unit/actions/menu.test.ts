import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── hoisted mocks ────────────────────────────────────────────────────────────

const {
  mockRequireRole,
  mockRevalidatePath,
  mockServiceInstance,
  MockMenuService,
} = vi.hoisted(() => {
  const mockServiceInstance = {
    createForDate: vi.fn(),
    addItem: vi.fn(),
    patchItem: vi.fn(),
    toggleAvailability: vi.fn(),
    setComboConfig: vi.fn(),
    openDay: vi.fn(),
    closeDay: vi.fn(),
  };
  // Regular function (not arrow) so it can be called with `new`
  const MockMenuService = vi.fn(function MockMenuServiceMock(this: Record<string, unknown>) {
    Object.assign(this, mockServiceInstance);
  });
  const mockRequireRole = vi.fn().mockResolvedValue({ staffUserId: 7, role: 'admin' });
  const mockRevalidatePath = vi.fn();
  return { mockRequireRole, mockRevalidatePath, mockServiceInstance, MockMenuService };
});

vi.mock('@/lib/auth/guards', () => ({ requireRoleOrRedirect: mockRequireRole }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/server/services/menu', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/services/menu')>();
  return { ...actual, MenuService: MockMenuService };
});

import {
  addItemAction,
  closeDayAction,
  createMenuAction,
  openDayAction,
  patchItemAction,
  setComboConfigAction,
  toggleAvailabilityAction,
} from '@/server/actions/menu';
import { MenuServiceError } from '@/server/services/menu';

// ── helpers ───────────────────────────────────────────────────────────────────

function serviceError(code: string) {
  return Object.assign(new MenuServiceError(code, `Error: ${code}`), { code });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireRole.mockResolvedValue({ staffUserId: 7, role: 'admin' });
});

// ── createMenuAction ─────────────────────────────────────────────────────────

describe('createMenuAction', () => {
  it('requires admin role', async () => {
    mockRequireRole.mockRejectedValue(new Error('redirect'));
    await expect(createMenuAction({ serviceDate: '2026-05-23' })).rejects.toThrow('redirect');
    expect(mockRequireRole).toHaveBeenCalledWith(['admin']);
  });

  it('returns VALIDATION_ERROR on invalid date format', async () => {
    const res = await createMenuAction({ serviceDate: 'not-a-date' });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
    expect(mockServiceInstance.createForDate).not.toHaveBeenCalled();
  });

  it('calls service and revalidates on success', async () => {
    mockServiceInstance.createForDate.mockResolvedValue({ menuId: 42, itemsCloned: 0 });
    const res = await createMenuAction({ serviceDate: '2026-05-23' });
    expect(res).toEqual({ ok: true, data: { menuId: 42, itemsCloned: 0 } });
    expect(mockServiceInstance.createForDate).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: 7 }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/menu');
  });

  it('returns service error code on MenuServiceError', async () => {
    mockServiceInstance.createForDate.mockRejectedValue(serviceError('MENU_DATE_CONFLICT'));
    const res = await createMenuAction({ serviceDate: '2026-05-23' });
    expect(res).toMatchObject({ ok: false, error: { code: 'MENU_DATE_CONFLICT' } });
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it('re-throws unknown errors', async () => {
    mockServiceInstance.createForDate.mockRejectedValue(new Error('db down'));
    await expect(createMenuAction({ serviceDate: '2026-05-23' })).rejects.toThrow('db down');
  });

  it('passes cloneFromDate when provided', async () => {
    mockServiceInstance.createForDate.mockResolvedValue({ menuId: 10, itemsCloned: 3 });
    await createMenuAction({ serviceDate: '2026-05-23', cloneFromDate: '2026-05-22' });
    expect(mockServiceInstance.createForDate).toHaveBeenCalledWith(
      expect.objectContaining({ cloneFromDate: expect.any(Date) }),
    );
  });
});

// ── addItemAction ─────────────────────────────────────────────────────────────

describe('addItemAction', () => {
  it('returns VALIDATION_ERROR when name is missing', async () => {
    const res = await addItemAction({ dailyMenuId: 1, category: 'main' });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('calls service with correct args on valid input', async () => {
    mockServiceInstance.addItem.mockResolvedValue({ itemId: 77 });
    const res = await addItemAction({
      dailyMenuId: 1,
      name: 'Pollo',
      category: 'main',
    });
    expect(res).toEqual({ ok: true, data: { itemId: 77 } });
    expect(mockServiceInstance.addItem).toHaveBeenCalledWith(
      expect.objectContaining({ dailyMenuId: 1, name: 'Pollo', actorId: 7 }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/menu');
  });

  it('returns ITEM_NOT_FOUND error from service', async () => {
    mockServiceInstance.addItem.mockRejectedValue(serviceError('ITEM_NOT_FOUND'));
    const res = await addItemAction({ dailyMenuId: 1, name: 'X', category: 'main' });
    expect(res).toMatchObject({ ok: false, error: { code: 'ITEM_NOT_FOUND' } });
  });
});

// ── patchItemAction ───────────────────────────────────────────────────────────

describe('patchItemAction', () => {
  it('returns VALIDATION_ERROR when no fields provided', async () => {
    const res = await patchItemAction(1, {});
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('calls service with itemId and actorId', async () => {
    mockServiceInstance.patchItem.mockResolvedValue(undefined);
    const res = await patchItemAction(99, { name: 'Nuevo' });
    expect(res).toEqual({ ok: true, data: undefined });
    expect(mockServiceInstance.patchItem).toHaveBeenCalledWith(
      99,
      expect.objectContaining({ name: 'Nuevo' }),
      7,
    );
  });
});

// ── toggleAvailabilityAction ──────────────────────────────────────────────────

describe('toggleAvailabilityAction', () => {
  it('returns VALIDATION_ERROR when itemId is missing', async () => {
    const res = await toggleAvailabilityAction({ isAvailable: true });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('calls service correctly', async () => {
    mockServiceInstance.toggleAvailability.mockResolvedValue(undefined);
    const res = await toggleAvailabilityAction({ itemId: 55, isAvailable: false });
    expect(res).toEqual({ ok: true, data: undefined });
    expect(mockServiceInstance.toggleAvailability).toHaveBeenCalledWith(55, false, 7);
  });
});

// ── setComboConfigAction ──────────────────────────────────────────────────────

describe('setComboConfigAction', () => {
  const validCombo = {
    dailyMenuId: 1,
    dineInPriceCents: 1300,
    takeawayPriceCents: 1500,
    tupperFullPriceCents: 200,
    tupperPartialPriceCents: 100,
    partialStarterPriceCents: 700,
    partialMainPriceCents: 900,
  };

  it('returns VALIDATION_ERROR when price is zero', async () => {
    const res = await setComboConfigAction({ ...validCombo, dineInPriceCents: 0 });
    expect(res).toMatchObject({ ok: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('calls service with config excluding dailyMenuId', async () => {
    mockServiceInstance.setComboConfig.mockResolvedValue(undefined);
    const res = await setComboConfigAction(validCombo);
    expect(res).toEqual({ ok: true, data: undefined });
    expect(mockServiceInstance.setComboConfig).toHaveBeenCalledWith(
      1,
      expect.not.objectContaining({ dailyMenuId: expect.anything() }),
      7,
    );
  });
});

// ── openDayAction ─────────────────────────────────────────────────────────────

describe('openDayAction', () => {
  it('calls service.openDay and revalidates', async () => {
    mockServiceInstance.openDay.mockResolvedValue(undefined);
    const res = await openDayAction(1);
    expect(res).toEqual({ ok: true, data: undefined });
    expect(mockServiceInstance.openDay).toHaveBeenCalledWith(1, 7);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/menu');
  });

  it('returns MISSING_COMBO_CONFIG from service', async () => {
    mockServiceInstance.openDay.mockRejectedValue(serviceError('MISSING_COMBO_CONFIG'));
    const res = await openDayAction(1);
    expect(res).toMatchObject({ ok: false, error: { code: 'MISSING_COMBO_CONFIG' } });
  });

  it('returns ALREADY_OPENED from service', async () => {
    mockServiceInstance.openDay.mockRejectedValue(serviceError('ALREADY_OPENED'));
    const res = await openDayAction(1);
    expect(res).toMatchObject({ ok: false, error: { code: 'ALREADY_OPENED' } });
  });
});

// ── closeDayAction ────────────────────────────────────────────────────────────

describe('closeDayAction', () => {
  it('calls service.closeDay and revalidates', async () => {
    mockServiceInstance.closeDay.mockResolvedValue(undefined);
    const res = await closeDayAction(1);
    expect(res).toEqual({ ok: true, data: undefined });
    expect(mockServiceInstance.closeDay).toHaveBeenCalledWith(1, 7);
  });

  it('returns MENU_NOT_OPEN from service', async () => {
    mockServiceInstance.closeDay.mockRejectedValue(serviceError('MENU_NOT_OPEN'));
    const res = await closeDayAction(1);
    expect(res).toMatchObject({ ok: false, error: { code: 'MENU_NOT_OPEN' } });
  });
});
