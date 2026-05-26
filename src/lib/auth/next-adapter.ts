import type { CookieStore } from './session.types';

export async function nextCookies(): Promise<CookieStore> {
  // Dynamic import prevents bundling next/headers in test environments
  const { cookies } = await import('next/headers');
  // Next.js 15 App Router: cookies() is async
  const store = await (cookies as unknown as () => Promise<{
    get(name: string): { name: string; value: string } | undefined;
    set(name: string, value: string, options?: unknown): void;
    delete(name: string): void;
  }>)();
  return {
    get: (name) => store.get(name),
    set: (name, value, options) => store.set(name, value, options),
    delete: (name) => store.delete(name),
  };
}
