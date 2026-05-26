export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getRealtimeBus } = await import('@/lib/realtime/listener');
    const bus = getRealtimeBus();
    console.log('[realtime] listener state:', bus.state());

    if (process.env.RUN_CRON !== 'false') {
      const { startOrderExpirationCron } = await import(
        '@/server/cron/expire-orders'
      );
      startOrderExpirationCron();
      console.log('[cron] order expiration cron started');
    }
  }
}
