import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { UNSAFE_flatRoutes } from "@remix-run/dev";
import { describe, expect, it } from "vitest";

import { loader as analyticsNewLoader } from "~/routes/app.analytics_.new";
import { loader as mysteryBoxDetailLoader } from "~/routes/app.points_.mystery-boxes_.$id";
import { loader as raffleDetailLoader } from "~/routes/app.points_.raffles_.$id";
import { loader as challengeDetailLoader } from "~/routes/app.rewards.challenges_.$id";

const appDirectory = resolve(process.cwd(), "app");
const routesDirectory = resolve(appDirectory, "routes");
const routeManifest = UNSAFE_flatRoutes(appDirectory, ["**/.*"], "routes");

function route(id: string) {
  const entry = routeManifest[id];
  expect(entry, `Expected route manifest entry ${id}`).toBeDefined();
  return entry;
}

function readRoute(file: string) {
  return readFileSync(resolve(routesDirectory, file), "utf8");
}

async function runLoader(
  loader: (args: LoaderFunctionArgs) => Response | Promise<Response>,
  url: string,
  params: Record<string, string> = {},
) {
  return loader({
    request: new Request(url),
    params,
    context: {},
  } as LoaderFunctionArgs);
}

describe("nested app route layouts", () => {
  it("renders mission list and detail routes through an Outlet-bearing parent", () => {
    const parent = route("routes/app.rewards.missions");
    const index = route("routes/app.rewards.missions._index");
    const detail = route("routes/app.rewards.missions.$id");

    expect(readRoute("app.rewards.missions.tsx")).toMatch(/<Outlet\s*\/>/);
    expect(parent).toMatchObject({
      parentId: "routes/app.rewards",
      path: "missions",
    });
    expect(index).toMatchObject({
      parentId: parent.id,
      index: true,
    });
    expect(detail).toMatchObject({
      parentId: parent.id,
      path: ":id",
    });
  });

  it("renders campaign detail and send routes through an Outlet-bearing parent", () => {
    const parent = route("routes/app.marketing.campaigns.$id");
    const index = route("routes/app.marketing.campaigns.$id._index");
    const send = route("routes/app.marketing.campaigns.$id.send");

    expect(readRoute("app.marketing.campaigns.$id.tsx")).toMatch(/<Outlet\s*\/>/);
    expect(parent).toMatchObject({
      parentId: "routes/app.marketing.campaigns",
      path: ":id",
    });
    expect(index).toMatchObject({
      parentId: parent.id,
      index: true,
    });
    expect(send).toMatchObject({
      parentId: parent.id,
      path: "send",
    });
  });
});

describe("flattened compatibility routes", () => {
  it.each([
    {
      name: "mystery box detail",
      routeId: "routes/app.points_.mystery-boxes_.$id",
      path: "points/mystery-boxes/:id",
      loader: mysteryBoxDetailLoader,
      oldUrl: "https://example.test/app/points/mystery-boxes/box-42?host=abc&embedded=1",
      expectedLocation: "/app/rewards/mystery-boxes/box-42?host=abc&embedded=1",
    },
    {
      name: "raffle detail",
      routeId: "routes/app.points_.raffles_.$id",
      path: "points/raffles/:id",
      loader: raffleDetailLoader,
      oldUrl: "https://example.test/app/points/raffles/draw-7?host=abc&embedded=1",
      expectedLocation: "/app/rewards/raffles/draw-7?host=abc&embedded=1",
    },
    {
      name: "challenge detail",
      routeId: "routes/app.rewards.challenges_.$id",
      path: "challenges/:id",
      loader: challengeDetailLoader,
      oldUrl: "https://example.test/app/rewards/challenges/mission-9?host=abc&embedded=1",
      expectedLocation: "/app/rewards/missions/mission-9?host=abc&embedded=1",
    },
  ])(
    "keeps the $name URL but redirects without running its legacy list parent",
    async ({ routeId, path, loader, oldUrl, expectedLocation }) => {
      const compatibilityRoute = route(routeId);
      const id = oldUrl.split("/").at(-1)?.split("?")[0] ?? "";
      const response = await runLoader(loader, oldUrl, { id });

      expect(compatibilityRoute).toMatchObject({ path });
      expect(compatibilityRoute.parentId).not.toMatch(
        /(?:mystery-boxes|raffles|challenges)$/,
      );
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe(expectedLocation);
    },
  );
});

describe("flattened non-UI analytics and integration routes", () => {
  it.each([
    [
      "routes/app.analytics_.export.csv",
      "routes/app",
      "analytics/export/csv",
    ],
    [
      "routes/app.analytics_.realtime",
      "routes/app",
      "analytics/realtime",
    ],
    [
      "routes/app.marketing.klaviyo_.connect",
      "routes/app.marketing",
      "klaviyo/connect",
    ],
  ])("%s preserves its URL outside its leaf UI parent", (id, parentId, path) => {
    expect(route(id)).toMatchObject({ parentId, path });
  });

  it("redirects the retired analytics UI to the canonical page with its query", async () => {
    expect(route("routes/app.analytics_.new")).toMatchObject({
      parentId: "routes/app",
      path: "analytics/new",
    });

    const response = await runLoader(
      analyticsNewLoader,
      "https://example.test/app/analytics/new?host=abc&embedded=1",
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/app/analytics?host=abc&embedded=1",
    );
  });
});
