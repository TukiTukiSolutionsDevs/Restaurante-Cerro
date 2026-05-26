import { cookies } from 'next/headers';

import { getDeviceSession } from '@/lib/auth/device-session';

import { KitchenBoard } from './_components/kitchen-board';
import { PairForm } from './_components/pair-form';

export const metadata = { title: 'Cocina en vivo — Restaurante Cerro' };

export default async function CocinaPage() {
  const store = await cookies();
  const cookieStore = {
    get: (name: string) => store.get(name),
    set: () => {},
    delete: () => {},
  };

  const session = await getDeviceSession(cookieStore);

  if (!session) {
    return <PairForm />;
  }

  return <KitchenBoard />;
}
