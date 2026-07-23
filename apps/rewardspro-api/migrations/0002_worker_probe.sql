SET LOCAL search_path = pg_catalog;

CREATE TABLE public.rp_worker_probe (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  acknowledged_at timestamptz,
  CONSTRAINT rp_worker_probe_expiry
    CHECK (expires_at > created_at),
  CONSTRAINT rp_worker_probe_ack_after_create
    CHECK (acknowledged_at IS NULL OR acknowledged_at >= created_at)
);

CREATE INDEX rp_worker_probe_expiry_idx
  ON public.rp_worker_probe (expires_at);
