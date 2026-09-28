// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PracticeLaunch } from "./PracticeLaunch";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("practice launch browser saves", () => {
  it.each(["not-json", "null", '"unexpected string"', '{"clears":[1]}'])("ignores malformed saves %s", async (saved) => {
    localStorage.setItem("ctcg-practice-clears", saved);
    await act(async () => root.render(<PracticeLaunch />));

    expect(container.querySelector('a[href="/play/adventure/1"]')?.textContent).toBe("Start practice");
    expect(container.textContent).not.toContain("cleared in this browser");
    expect(container.textContent).toContain("no results are recorded on the server");
    expect(localStorage.getItem("ctcg-practice-clears")).toBe(saved);
  });

  it("counts unique known level IDs and suggests the next uncleared level", async () => {
    localStorage.setItem("ctcg-practice-clears", JSON.stringify([1, 1, "2", 99, 2.5, null]));
    await act(async () => root.render(<PracticeLaunch />));

    expect(container.querySelector('a[href="/play/adventure/2"]')?.textContent).toBe("Start practice");
    expect(container.textContent).toContain("1/10 cleared in this browser");
    expect(container.querySelector('a[href="/play/adventure"]')?.textContent).toBe("Choose an opponent");
  });
});
