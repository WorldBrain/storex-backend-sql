import isArray from "lodash/isArray";
import isString from "lodash/isString";
import fromPairs from "lodash/fromPairs";
import mapValues from "lodash/mapValues";
import { diffObject, defaultDifferSelector, diffStringArray, objectArrayDiffer } from "./diff";
import { StorageCollectionsDefinition } from "../../types/schema-generated/storage-collections";
import { ObjectPath } from "../../user-logic/utils";
import { isChildOfRelation } from "../utils";
import { SchemaDiff } from "./types";

export function getSchemaDiff(
  fromCollections: StorageCollectionsDefinition,
  toCollections: StorageCollectionsDefinition
): SchemaDiff {
  const rawCollectionsDiff = diffObject(fromCollections, toCollections, { getDiffer: _collectionDifferSelector });

  const collections = {
    added: fromPairs(rawCollectionsDiff.added.map((name) => [name, toCollections[name]])),
    removed: rawCollectionsDiff.removed,
    changed: mapValues(rawCollectionsDiff.changed, (collectionDiff, collectionName) => {
      return {
        fields: {
          added: fromPairs(
            (collectionDiff.changed.fields || { added: [] }).added.map((fieldName: string) => [
              fieldName,
              toCollections[collectionName].fields[fieldName],
            ])
          ) as any,
          changed: {},
          removed: (collectionDiff.changed.fields || { removed: [] }).removed,
        },
        indices: {
          added: (collectionDiff.changed.indices || { added: [] }).added.map((change: { key: string }) => change.key),
          removed: (collectionDiff.changed.indices || { removed: [] }).removed.map(
            (change: { key: string }) => change.key
          ),
        },
        relationships: { added: [], removed: [] },
      };
    }),
  };

  return { collections };
}

export function _collectionDifferSelector(lhs: any, rhs: any, path: ObjectPath) {
  if (path.length === 2 && path[1] === "version") {
    return () => lhs.getTime() === rhs.getTime();
  }
  if (isArray(lhs)) {
    if (!lhs.length && !rhs.length) {
      return () => false;
    }
    if ((lhs.length && isString(lhs[0])) || (rhs.length && isString(rhs[0]))) {
      return diffStringArray;
    }
  }
  if (path.length === 2 && path[1] === "indices") {
    return objectArrayDiffer((index) => index.field);
  }
  if (path.length === 2 && path[1] === "relations") {
    return objectArrayDiffer((relation) => {
      if (isChildOfRelation(relation as any)) {
        return relation.childOf;
      } else {
        throw new Error(`Don't know how to diff this kind of relationship [${path.join(" -> ")}]`);
      }
    });
  }

  return defaultDifferSelector(lhs, rhs, path);
}

export function getInitialSchemaDiff(collections: StorageCollectionsDefinition): SchemaDiff {
  return { collections: { added: collections, changed: {}, removed: [] } };
}
