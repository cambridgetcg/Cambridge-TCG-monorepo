/**
 * A loopback bridge to a remote Postgres server whose TLS is verified by
 * Node, used by scripts/prisma-tls.ts to give Prisma's schema engine a
 * verified connection (see that file for why).
 *
 * The client (Prisma) speaks plain Postgres to 127.0.0.1; each connection is
 * forwarded through its own upstream connection, opened with Postgres'
 * SSLRequest and upgraded with tls.connect. Anything the TLS options do not
 * verify (chain or hostname) is refused before a byte of the client's
 * startup message is forwarded.
 */
import net from "node:net";
import tls from "node:tls";

const LOG_PREFIX = "[prisma-tls]";

// Postgres SSLRequest: length 8, request code 80877103
const SSL_REQUEST = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]);

export interface UpstreamTarget {
  host: string;
  port: number;
  /** CA and servername; verification is always on. */
  tls: tls.ConnectionOptions;
}

/** Connect to a Postgres server and upgrade to TLS, refusing anything unverified. */
export function connectVerified(target: UpstreamTarget): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const raw = net.connect({ host: target.host, port: target.port });
    raw.once("error", reject);
    raw.once("connect", () => raw.write(SSL_REQUEST));
    raw.once("data", (reply) => {
      if (reply.length !== 1 || reply[0] !== 0x53 /* 'S' */) {
        raw.destroy();
        reject(new Error(`${target.host} did not accept TLS`));
        return;
      }
      const secure = tls.connect({ ...target.tls, socket: raw, rejectUnauthorized: true });
      secure.once("error", reject);
      secure.once("secureConnect", () => {
        if (!secure.authorized) {
          secure.destroy();
          reject(new Error(`${target.host}: ${secure.authorizationError}`));
          return;
        }
        secure.removeListener("error", reject);
        resolve(secure);
      });
    });
  });
}

/** Listen on an ephemeral loopback port and bridge each connection to `target`. */
export function startVerifiedBridge(target: UpstreamTarget): Promise<net.Server> {
  let reported = false;
  const server = net.createServer((client) => {
    client.pause();
    connectVerified(target).then(
      (upstream) => {
        if (!reported) {
          reported = true;
          const peer = upstream.getPeerCertificate();
          console.error(`${LOG_PREFIX} upstream TLS verified: ${peer.subject?.CN} issued by ${peer.issuer?.CN} (${upstream.getProtocol()})`);
        }
        const close = () => {
          client.destroy();
          upstream.destroy();
        };
        client.on("error", close).on("close", close);
        upstream
          .on("error", (error) => {
            console.error(`${LOG_PREFIX} upstream error:`, error.message);
            close();
          })
          .on("close", close);
        client.pipe(upstream).pipe(client);
        client.resume();
      },
      (error: Error) => {
        console.error(`${LOG_PREFIX} refused upstream connection:`, error.message);
        client.destroy();
      },
    );
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

/** The same database URL, pointed at the bridge with TLS off on loopback. */
export function bridgedUrl(databaseUrl: string, port: number): string {
  const url = new URL(databaseUrl);
  url.hostname = "127.0.0.1";
  url.port = String(port);
  url.searchParams.set("sslmode", "disable");
  return url.toString();
}
