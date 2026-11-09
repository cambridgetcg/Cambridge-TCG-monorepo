import { Kind, parse, type SelectionSetNode } from "graphql";

/**
 * Every leaf field a GraphQL document's operations select, as sorted dotted
 * paths. A test's Admin API mock answers only the exact fields, so a renamed
 * or misspelt field fails the test as Shopify would fail the request.
 */
export function selectedFields(query: string): string[] {
  const fields: string[] = [];
  const walk = (selectionSet: SelectionSetNode, prefix: string) => {
    for (const selection of selectionSet.selections) {
      if (selection.kind !== Kind.FIELD) continue;
      const path = prefix + selection.name.value;
      if (selection.selectionSet) walk(selection.selectionSet, `${path}.`);
      else fields.push(path);
    }
  };
  for (const definition of parse(query).definitions) {
    if (definition.kind === Kind.OPERATION_DEFINITION) walk(definition.selectionSet, "");
  }
  return fields.sort();
}
