import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mock argon2 so tests don't do real hashing ───────────────────────────
vi.mock("argon2", () => ({
  hash: vi.fn().mockResolvedValue("$argon2id$v=19$mock-hash"),
  argon2id: 2,
}));

// ── Stable mock chain for the db insert pipeline ─────────────────────────
const mockReturning = vi.fn().mockResolvedValue([{ id: 1 }]);
const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
const mockInsert = vi.fn(() => ({ values: mockValues }));
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ insert: mockInsert })),
}));

vi.mock("pg", () => ({
  // Arrow functions cannot be used with `new`; must use a regular function
  Pool: vi.fn(function () {
    return { end: mockPoolEnd };
  }),
}));

// Prevent dotenv from reading real .env files during tests
vi.mock("dotenv/config", () => ({}));

beforeEach(() => {
  vi.clearAllMocks();
  // Re-arm the mock chain after clearAllMocks (clearAllMocks resets implementations)
  mockReturning.mockResolvedValue([{ id: 1 }]);
  mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning });
  mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });
  mockInsert.mockReturnValue({ values: mockValues });
  mockPoolEnd.mockResolvedValue(undefined);
});

async function runSeed() {
  // Dynamic import ensures the module re-uses our vi.mock factories
  const { seed } = await import("@/db/seed");
  await seed();
}

describe("seed()", () => {
  it("calls insert exactly 3 times (staffUser, restaurantTable, dailyMenu)", async () => {
    await runSeed();
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it("inserts 30 restaurant_table rows in a single values() call", async () => {
    await runSeed();
    // Second insert call is restaurantTable — values() receives the array
    const calls = mockValues.mock.calls as unknown[][];
    const tableRows = calls[1][0] as unknown[];
    expect(Array.isArray(tableRows)).toBe(true);
    expect(tableRows).toHaveLength(30);
  });

  it("uses onConflictDoNothing for idempotency on all 3 inserts", async () => {
    await runSeed();
    expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(3);
  });

  it("is idempotent: when all rows exist (returning []) it still runs without throwing", async () => {
    mockReturning.mockResolvedValue([]);
    await expect(runSeed()).resolves.toBeUndefined();
    expect(mockInsert).toHaveBeenCalledTimes(3);
  });

  it("table codes follow M01–M30 pattern", async () => {
    await runSeed();
    const calls = mockValues.mock.calls as unknown[][];
    const tableRows = calls[1][0] as Array<{ code: string }>;
    expect(tableRows[0].code).toBe("M01");
    expect(tableRows[29].code).toBe("M30");
  });

  it("tables span a 6×5 grid (positionX 0-5, positionY 0-4)", async () => {
    await runSeed();
    const calls = mockValues.mock.calls as unknown[][];
    const tableRows = calls[1][0] as Array<{
      positionX: number;
      positionY: number;
    }>;
    const xs = [...new Set(tableRows.map((t) => t.positionX))].sort((a, b) => a - b);
    const ys = [...new Set(tableRows.map((t) => t.positionY))].sort((a, b) => a - b);
    expect(xs).toEqual([0, 1, 2, 3, 4, 5]);
    expect(ys).toEqual([0, 1, 2, 3, 4]);
  });

  it("admin staff row has role=admin and displayName=Admin Dev", async () => {
    await runSeed();
    const calls = mockValues.mock.calls as unknown[][];
    const staffRow = calls[0][0] as {
      role: string;
      displayName: string;
    };
    expect(staffRow.role).toBe("admin");
    expect(staffRow.displayName).toBe("Admin Dev");
  });

  it("closes the pool after seeding", async () => {
    await runSeed();
    expect(mockPoolEnd).toHaveBeenCalledTimes(1);
  });
});
