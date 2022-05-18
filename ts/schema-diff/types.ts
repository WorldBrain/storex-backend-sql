import { CollectionDefinition, CollectionField } from "@worldbrain/storex";

export type Identifiers<Indentifier> = Array<Indentifier>;

export interface SchemaDiff {
  collections: ComplexDiff<CollectionDiff, string, { [name: string]: CollectionDefinition }>;
}
export interface Diff<Identifier = string, Additions = Identifiers<Identifier>> {
  added: Additions;
  removed: Identifiers<Identifier>;
  // renamed : {[from : string] : string} // Too complex to do safely, implement later if needed
}

export interface SimpleDiff<Identifier = string> extends Diff {
  changed: Identifiers<Identifier>;
}

export interface ComplexDiff<Changes, Identifier = string, Addition = Identifiers<Identifier>>
  extends Diff<Identifier, Addition> {
  changed: { [name: string]: Changes };
}

export interface CollectionDiff {
  fields: ComplexDiff<FieldDiff, string, { [name: string]: CollectionField }>;
  indices: Diff<string>;
  relationships: Diff;
}

export interface FieldDiff {
  attributes: SimpleDiff;
}
