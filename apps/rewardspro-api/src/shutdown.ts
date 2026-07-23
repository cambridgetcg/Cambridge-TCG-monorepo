import type { Logger } from "pino";

export interface ShutdownOptions {
  graceMs: number;
  logger: Pick<Logger, "info" | "error">;
  name: string;
  shutdown: () => Promise<void>;
}

export function installShutdownHandlers(options: ShutdownOptions): () => void {
  let shuttingDown = false;

  const handleSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    options.logger.info({ signal, service: options.name }, "shutdown requested");

    const forceExitTimer = setTimeout(() => {
      options.logger.error(
        { service: options.name },
        "graceful shutdown deadline exceeded",
      );
      process.exit(1);
    }, options.graceMs);
    forceExitTimer.unref();

    void options
      .shutdown()
      .catch((error: unknown) => {
        options.logger.error({ err: error, service: options.name }, "shutdown failed");
        process.exitCode = 1;
      })
      .finally(() => {
        clearTimeout(forceExitTimer);
      });
  };

  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  return () => {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
  };
}
