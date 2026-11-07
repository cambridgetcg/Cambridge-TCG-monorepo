/**
 * A background caller's answer while another renewal of the store's offline
 * token runs: try again later (Ruling 85). Its own module, with no imports,
 * so the proxy, the jobs and their unit tests can tell it apart without
 * loading the session storage and its database client.
 */
export class RenewalBusyError extends Error {
  constructor(readonly shop: string) {
    super(`Another renewal of ${shop}'s offline token is still running; try again later`);
    this.name = "RenewalBusyError";
  }
}
