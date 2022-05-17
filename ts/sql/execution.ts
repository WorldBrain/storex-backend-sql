import { StorageCollectionDefinition } from "../types/storage-collections";
import { StorageOperation } from "../types/storage-operations";
import { timestampToISO } from "../utils";
import { isChildOfRelation, isConnectsRelation } from "../utils";
import { renderSqlAst, SqlRenderNodes } from "./ast";
import { OperationTransformOptions, transformOperationTemplate } from "./operations";
import { ResultsetTransformOptions, transformResultsetToTree } from "./results";
import { SqlSchemaUpdateOptions } from "./schema";
import type { DatabaseCapabilties } from "./types";

export function getSqlFieldTypes(dbCapabilities: DatabaseCapabilties): SqlSchemaUpdateOptions["fieldTypes"] {
  return {
    string: "TEXT",
    timestamp: dbCapabilities.datetimeFields ? "DATETIME" : "TEXT",
    json: dbCapabilities.jsonFields ? "JSON" : "TEXT",
  };
}

export function getFieldNames(collectionDefinition: StorageCollectionDefinition) {
  const objectFieldNames = Object.keys(collectionDefinition.fields);
  const relationFieldNames: string[] = [];
  for (const relation of collectionDefinition.relations ?? []) {
    if (isChildOfRelation(relation)) {
      relationFieldNames.push(
        relation.alias ?? ("childOf" in relation ? relation.childOf : relation.singleChildOf) + "Id"
      );
    } else if (isConnectsRelation(relation)) {
      relationFieldNames.push(relation.aliases?.[0] ?? relation.connects[0] + "Id");
      relationFieldNames.push(relation.aliases?.[1] ?? relation.connects[1] + "Id");
    }
  }
  return ["id", ...objectFieldNames, ...relationFieldNames];
}

export function getPkField() {
  return "id";
}

export function getOperationTransformationOptions(
  storageCollections: { [name: string]: StorageCollectionDefinition }
): OperationTransformOptions {
  return {
    getPkField,
    getFieldNames: (collectionName) => {
      const collectionDefinition = storageCollections[collectionName];
      return getFieldNames(collectionDefinition);
    },
    getStoredForeignKeyName: (source) => `${source}Id`,
  };
}

export function getTransformResultValue(
  storageCollections: { [name: string]: StorageCollectionDefinition },
  dbCapabilities: DatabaseCapabilties
) {
  const transform: ResultsetTransformOptions["transformFieldValue"] = (value, fieldName, collectionName) => {
    const collectionDefinition = storageCollections[collectionName];
    const fieldDefinition = collectionDefinition.fields[fieldName];
    if (!fieldDefinition) {
      return value;
    }
    if (fieldDefinition.type === "timestamp") {
      const dateObject = dbCapabilities.datetimeFields ? value : new Date(value);
      return dateObject.getTime();
    }
    if (fieldDefinition.type === "json" && !dbCapabilities.jsonFields) {
      return JSON.parse(value);
    }
    return value;
  };
  return transform;
}

export function prepareObjectForWrite(
  object: any,
  fields: StorageCollectionDefinition["fields"],
  options: DatabaseCapabilties
) {
  for (const [fieldName, fieldDefinition] of Object.entries(fields)) {
    if (!(fieldName in object)) {
      continue;
    }
    if (fieldDefinition.type === "timestamp") {
      object[fieldName] = timestampToISO(object[fieldName] as number);
    }
    if (fieldDefinition.type === "json" && !options.jsonFields) {
      object[fieldName] = JSON.stringify(object[fieldName]);
    }
  }
}

export function prepareStorageOperation(
  operation: StorageOperation,
  storageCollections: { [name: string]: StorageCollectionDefinition },
  dbCapabilities: DatabaseCapabilties
) {
  if (operation.operation == "createObject") {
    const collectionDefinition = storageCollections[operation.collection];
    prepareObjectForWrite(operation.object, collectionDefinition.fields, dbCapabilities);
  }
  return operation;
}

export async function executeOperation(
  operation: StorageOperation,
  database: {
    run(sql: string): { lastInsertRowId: number },
    all(sql: string): any[]
  },
  storageCollections: { [name: string]: StorageCollectionDefinition },
  dbCapabilities: DatabaseCapabilties,
  sqlNodes: SqlRenderNodes
) {
  operation = prepareStorageOperation(operation, storageCollections, dbCapabilities);
  const transformed = transformOperationTemplate(operation, getOperationTransformationOptions(storageCollections));
  const sql = renderSqlAst({ ast: transformed.sqlAst, nodes: sqlNodes });
  if (operation.operation === "createObject") {
    const result = database.run(sql);
    return { pk: result.lastInsertRowId };
  }
  if (operation.operation === "findObject" || operation.operation === "findObjects") {
    const rows = database.all(sql);
    const result = transformResultsetToTree(rows, operation.collection, operation.relations ?? [], {
      getPkField,
      transformFieldValue: getTransformResultValue(storageCollections, dbCapabilities),
    });
    return { result };
  }
}
