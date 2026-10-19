// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { bridgedUrl, connectVerified, startVerifiedBridge } from "../../../scripts/lib/postgres-tls-bridge";

/** A throwaway CA and a localhost server certificate, made with openssl. */
function makeCertificates(dir: string) {
  const openssl = (...args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: "pipe" });
  for (const name of ["ca", "other-ca"]) {
    openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.crt`, "-days", "1", "-subj", `/CN=${name}`);
  }
  openssl("req", "-newkey", "rsa:2048", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost");
  writeFileSync(join(dir, "ext.cnf"), "subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n");
  openssl("x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "1", "-extfile", "ext.cnf");
  const read = (file: string) => readFileSync(join(dir, file), "utf8");
  return { ca: read("ca.crt"), otherCa: read("other-ca.crt"), key: read("server.key"), cert: read("server.crt") };
}

/**
 * Speaks just enough Postgres: answers an SSLRequest with `reply`, then
 * (for 'S') upgrades to TLS and echoes everything back.
 */
function fakePostgres(certs: { key: string; cert: string }, reply: "S" | "N" = "S"): Promise<net.Server> {
  const server = net.createServer((socket) => {
    socket.once("data", (request) => {
      expect(request.readInt32BE(4)).toBe(80877103);
      socket.write(reply);
      if (reply === "N") return socket.end();
      const secure = new tls.TLSSocket(socket, { isServer: true, key: certs.key, cert: certs.cert });
      secure.on("error", () => socket.destroy());
      secure.pipe(secure);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function portOf(server: net.Server) {
  return (server.address() as net.AddressInfo).port;
}

describe("postgres TLS bridge", () => {
  let dir: string;
  let certs: ReturnType<typeof makeCertificates>;
  let upstream: net.Server;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "rp-tls-"));
    certs = makeCertificates(dir);
    upstream = await fakePostgres(certs);
  });

  afterAll(() => {
    upstream?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const target = (ca: string, servername = "localhost") => ({
    host: "127.0.0.1",
    port: portOf(upstream),
    tls: { ca, servername },
  });

  it("connects when the chain and the hostname verify", async () => {
    const socket = await connectVerified(target(certs.ca));
    expect(socket.authorized).toBe(true);
    socket.destroy();
  });

  it("refuses a server certificate from another CA", async () => {
    await expect(connectVerified(target(certs.otherCa))).rejects.toThrow(/certificate/i);
  });

  it("refuses a certificate for another hostname", async () => {
    await expect(connectVerified(target(certs.ca, "db.example.test"))).rejects.toThrow(/does not match/i);
  });

  it("refuses a server that declines TLS", async () => {
    const plain = await fakePostgres(certs, "N");
    await expect(
      connectVerified({ host: "127.0.0.1", port: portOf(plain), tls: { ca: certs.ca, servername: "localhost" } }),
    ).rejects.toThrow(/did not accept TLS/);
    plain.close();
  });

  it("forwards client bytes over the verified connection and back", async () => {
    const bridge = await startVerifiedBridge(target(certs.ca));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const echoed = await new Promise<string>((resolve, reject) => {
      const client = net.connect({ host: "127.0.0.1", port: portOf(bridge) }, () => client.write("startup"));
      client.once("data", (data) => {
        resolve(data.toString());
        client.destroy();
      });
      client.once("error", reject);
    });
    expect(echoed).toBe("startup");
    bridge.close();
  });

  it("closes the client when the upstream does not verify", async () => {
    const bridge = await startVerifiedBridge(target(certs.otherCa));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const closed = await new Promise<boolean>((resolve) => {
      const client = net.connect({ host: "127.0.0.1", port: portOf(bridge) }, () => client.write("startup"));
      client.on("data", () => resolve(false));
      client.on("close", () => resolve(true));
    });
    expect(closed).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("refused upstream connection"), expect.any(String));
    bridge.close();
  });

  it("points the URL at the bridge with TLS off on loopback only", () => {
    const url = bridgedUrl(
      "postgresql://rewardspro_app.ref:fake@aws-0-eu-west-2.pooler.supabase.com:5432/postgres?schema=rewardspro",
      41000,
    );
    expect(url).toBe("postgresql://rewardspro_app.ref:fake@127.0.0.1:41000/postgres?schema=rewardspro&sslmode=disable");
  });
});
