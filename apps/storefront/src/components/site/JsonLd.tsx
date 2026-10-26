/** Structured data (schema.org JSON-LD) as a plain <script>, so it is in the
 *  server HTML that crawlers read. next/script would add it only after
 *  hydration, and Next's JSON-LD guide recommends the native tag. Every `<`
 *  is escaped as <, so no string in the data (a card or product name
 *  from the database, say) can close the tag. */
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
