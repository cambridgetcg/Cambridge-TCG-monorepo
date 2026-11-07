import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JsonLd } from "./JsonLd";

describe("JsonLd", () => {
  it("renders the data as an application/ld+json script in the server HTML", () => {
    const html = renderToStaticMarkup(<JsonLd data={{ "@type": "Organization", name: "Cambridge TCG" }} />);
    expect(html).toBe('<script type="application/ld+json">{"@type":"Organization","name":"Cambridge TCG"}</script>');
  });

  it("keeps a string in the data from closing the tag, and the JSON still parses to the same value", () => {
    const data = { name: "</script><script>alert(1)</script>" };
    const html = renderToStaticMarkup(<JsonLd data={data} />);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    const body = html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"));
    expect(JSON.parse(body)).toEqual(data);
  });
});
