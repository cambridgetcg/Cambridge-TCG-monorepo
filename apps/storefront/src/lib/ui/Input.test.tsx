import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input, Select, Textarea } from "./Input";

const appearanceClasses = [
  "w-full", "bg-surface", "border", "border-border-subtle", "rounded-lg",
  "text-ink", "placeholder:text-ink-faint", "focus:outline-none", "focus:ring-2",
  "focus:ring-accent/50", "focus:border-accent/50", "disabled:opacity-50",
];

function classes(markup: string) {
  return markup.match(/class="([^"]*)"/)?.[1].split(/\s+/) ?? [];
}

describe.each([
  ["Input", Input],
  ["Select", Select],
] as const)("%s density", (_name, Control) => {
  it("keeps the original default geometry, appearance, and custom classes", () => {
    const markup = renderToStaticMarkup(<Control className="custom-control" />);

    expect(classes(markup)).toEqual(expect.arrayContaining([
      ...appearanceClasses, "px-3", "py-2", "text-sm", "custom-control",
    ]));
    expect(classes(markup)).not.toContain("min-h-11");
    expect(classes(markup)).not.toContain("text-base");
    expect(renderToStaticMarkup(
      <Control density="default" className="custom-control" />,
    )).toBe(markup);
    expect(markup).not.toMatch(/\sdensity=/);
  });

  it("opts into comfortable geometry without changing appearance or focus", () => {
    const markup = renderToStaticMarkup(
      <Control density="comfortable" className="custom-control" />,
    );

    expect(classes(markup)).toEqual(expect.arrayContaining([
      ...appearanceClasses, "min-h-11", "px-3", "py-2", "text-base", "custom-control",
    ]));
    expect(classes(markup)).not.toContain("text-sm");
    expect(classes(markup)).not.toContain("h-11");
    expect(markup).not.toMatch(/\sdensity=/);
  });
});

describe("native form props", () => {
  it("preserves input identity, initial value, constraints, and accessibility attributes", () => {
    const markup = renderToStaticMarkup(
      <Input
        density="comfortable"
        ref={React.createRef<HTMLInputElement>()}
        id="card-number"
        name="q"
        type="search"
        defaultValue="OP01-001"
        placeholder="Card number"
        required
        autoFocus
        autoComplete="off"
        maxLength={40}
        size={20}
        form="price-search"
        aria-describedby="query-hint"
        data-control="query"
      />,
    );

    for (const attribute of [
      'id="card-number"', 'name="q"', 'type="search"', 'value="OP01-001"',
      'placeholder="Card number"', 'required=""', 'autofocus=""',
      'autoComplete="off"', 'maxLength="40"', 'size="20"', 'form="price-search"',
      'aria-describedby="query-hint"', 'data-control="query"',
    ]) {
      expect(markup).toContain(attribute);
    }
    expect(markup).not.toMatch(/\s(?:density|ref)=/);
  });

  it("preserves native disabled and read-only input states", () => {
    const markup = renderToStaticMarkup(<Input density="comfortable" disabled readOnly />);
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('readOnly=""');
  });

  it("preserves select options, selection, native size, and accessibility attributes", () => {
    const markup = renderToStaticMarkup(
      <Select
        density="comfortable"
        ref={React.createRef<HTMLSelectElement>()}
        id="language"
        name="lang"
        defaultValue="en"
        required
        disabled
        size={3}
        form="price-search"
        aria-label="Card language"
      >
        <option value="ja">Japanese</option>
        <option value="en">English</option>
      </Select>,
    );

    for (const attribute of [
      'id="language"', 'name="lang"', 'required=""', 'disabled=""', 'size="3"',
      'form="price-search"', 'aria-label="Card language"',
    ]) {
      expect(markup).toContain(attribute);
    }
    expect(markup).toContain('<option value="ja">Japanese</option>');
    expect(markup).toContain('<option value="en" selected="">English</option>');
    expect(markup).not.toMatch(/\s(?:density|ref)=/);
  });

  it("preserves multiple select values", () => {
    const markup = renderToStaticMarkup(
      <Select density="comfortable" name="lang" multiple defaultValue={["ja", "en"]}>
        <option value="ja">Japanese</option>
        <option value="en">English</option>
      </Select>,
    );
    expect(markup).toContain('multiple=""');
    expect(markup.match(/selected=""/g)).toHaveLength(2);
  });

  it("leaves Textarea default styling and native props unchanged", () => {
    const markup = renderToStaticMarkup(
      <Textarea
        ref={React.createRef<HTMLTextAreaElement>()}
        className="custom-control"
        id="notes"
        name="notes"
        defaultValue="Collector notes"
        rows={4}
        maxLength={200}
        required
      />,
    );

    expect(classes(markup)).toEqual(expect.arrayContaining([
      ...appearanceClasses, "px-3", "py-2", "text-sm", "resize-y", "custom-control",
    ]));
    expect(classes(markup)).not.toContain("text-base");
    expect(classes(markup)).not.toContain("min-h-11");
    for (const attribute of ['id="notes"', 'name="notes"', 'rows="4"', 'maxLength="200"', 'required=""']) {
      expect(markup).toContain(attribute);
    }
    expect(markup).toContain(">Collector notes</textarea>");
  });
});
