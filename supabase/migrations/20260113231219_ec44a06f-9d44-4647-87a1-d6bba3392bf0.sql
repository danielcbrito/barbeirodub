INSERT INTO assinaturas (user_id, plano_id, status, payment_method, next_billing_date)
VALUES (
  '99ca8171-b9f5-4d7f-986b-949dde99c778',
  'd292ce6c-1d9d-4741-83e2-5ba0540ce805',
  'active',
  'pix',
  (CURRENT_DATE + INTERVAL '30 days')::date
)