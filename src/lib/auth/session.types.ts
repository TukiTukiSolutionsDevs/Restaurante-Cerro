export type StaffRole = 'cashier' | 'waiter' | 'admin';

export interface StaffSessionData {
  staffUserId: number;
  role: StaffRole;
  displayName: string;
  loggedInAt: number;
  lastSeenAt: number;
}

export type CookieStore = {
  get: (name: string) => { value: string } | undefined;
  set: (name: string, value: string, options?: unknown) => void;
  delete: (name: string) => void;
};

export type RequireRoleResult =
  | { ok: true; session: StaffSessionData }
  | { ok: false; reason: 'no_session' | 'expired' | 'wrong_role' };
