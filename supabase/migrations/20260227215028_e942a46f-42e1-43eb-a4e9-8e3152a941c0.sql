
SELECT cron.schedule(
  'auto-suspend-cash-subscriptions',
  '0 3 * * *',
  $$SELECT public.auto_suspend_expired_cash_subscriptions();$$
);
