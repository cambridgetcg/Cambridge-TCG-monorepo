import type pg from "pg";

interface ProbeStatusRow extends pg.QueryResultRow {
  acknowledged: boolean;
}

export class WorkerProbeNotDeliverableError extends Error {
  override readonly name = "WorkerProbeNotDeliverableError";
}

export class WorkerProbeAcknowledgementError extends Error {
  override readonly name = "WorkerProbeAcknowledgementError";
}

export interface WorkerProbeStore {
  acknowledge(probeId: string): Promise<void>;
  assertDeliverable(probeId: string): Promise<void>;
}

export class PostgresWorkerProbeStore implements WorkerProbeStore {
  constructor(private readonly pool: Pick<pg.Pool, "query">) {}

  async create(probeId: string, lifetimeSeconds: number): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.rp_worker_probe (id, expires_at)
       VALUES ($1, now() + ($2 * interval '1 second'))`,
      [probeId, lifetimeSeconds],
    );
  }

  async assertDeliverable(probeId: string): Promise<void> {
    const result = await this.pool.query(
      `SELECT 1
         FROM public.rp_worker_probe
        WHERE id = $1
          AND expires_at > now()`,
      [probeId],
    );
    if (result.rowCount !== 1) {
      throw new WorkerProbeNotDeliverableError(
        "Worker probe is missing or expired",
      );
    }
  }

  async acknowledge(probeId: string): Promise<void> {
    const result = await this.pool.query(
      `UPDATE public.rp_worker_probe
          SET acknowledged_at = COALESCE(acknowledged_at, now())
        WHERE id = $1
          AND expires_at > now()`,
      [probeId],
    );
    if (result.rowCount !== 1) {
      throw new WorkerProbeAcknowledgementError(
        "Worker probe acknowledgement could not be persisted",
      );
    }
  }

  async isAcknowledged(probeId: string): Promise<boolean> {
    const result = await this.pool.query<ProbeStatusRow>(
      `SELECT (acknowledged_at IS NOT NULL) AS acknowledged
         FROM public.rp_worker_probe
        WHERE id = $1`,
      [probeId],
    );
    return result.rows[0]?.acknowledged === true;
  }

  async delete(probeId: string): Promise<void> {
    await this.pool.query("DELETE FROM public.rp_worker_probe WHERE id = $1", [
      probeId,
    ]);
  }

  async deleteExpired(): Promise<void> {
    await this.pool.query(
      "DELETE FROM public.rp_worker_probe WHERE expires_at <= now()",
    );
  }
}
