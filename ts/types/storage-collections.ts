export type RelationDefinition =
  | ChildOfRelationDefinition
  | SingleChildOfRelationDefinition
  | ConnectsRelationDefinition;
export type IndexDefinition = FieldIndexDefinition | RelationIndexDefinition;

export interface StorageCollectionsDefinition {
  [k: string]: StorageCollectionDefinition;
}
export interface StorageCollectionDefinition {
  fields: FieldDefinitions;
  relations?: RelationDefinition[];
  indices?: IndexDefinition[];
  groupBy?: GroupDefinition[];
}
export interface FieldDefinitions {
  [k: string]: FieldDefinition;
}
export interface FieldDefinition {
  type: "string" | "boolean" | "number" | "timestamp" | "int" | "json";
  optional?: boolean;
}
export interface ChildOfRelationDefinition {
  alias?: string;
  reverseAlias?: string;
  childOf: string;
  optional?: boolean;
}
export interface SingleChildOfRelationDefinition {
  alias?: string;
  reverseAlias?: string;
  singleChildOf: string;
  optional?: boolean;
}
export interface ConnectsRelationDefinition {
  aliases?: string[];
  reverseAliases?: string[];
  connects: string[];
}
export interface FieldIndexDefinition {
  pk?: boolean;
  field: {
    relation: string;
  };
}
export interface RelationIndexDefinition {
  pk?: boolean;
  field: string;
}
export interface GroupDefinition {
  key: string;
  subcollectionName: string;
  [k: string]: unknown;
}
