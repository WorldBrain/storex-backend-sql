import { QueryRelations } from "../types/storage-operations";
import { StorageResultTreeNode } from "../types";
import { OperationTransformOptions } from "./operations";

export interface ResultsetTransformOptions {
  getPkField: OperationTransformOptions["getPkField"];
  transformFieldValue?(value: any, fieldName: string, collectionName: string): any;
}

export function transformResultsetToTree(
  rows: any[],
  topCollection: string,
  relations: QueryRelations,
  options: ResultsetTransformOptions
) {
  const nodes: { [collection: string]: { [pk: string]: StorageResultTreeNode } } = {};
  const getCollectionNodes = (collection: string) => {
    if (nodes[collection]) {
      return nodes[collection];
    }

    const collectionNodes = (nodes[collection] = {});
    return collectionNodes;
  };
  const getOrCreateNode = (collection: string, object: any): [/* node: */ StorageResultTreeNode, /* created: */ boolean] => {
    const collectionNodes = getCollectionNodes(collection);
    const objectPk = object[options.getPkField(collection)];
    if (collectionNodes[objectPk]) {
      return [collectionNodes[objectPk], false];
    }

    const node = (collectionNodes[objectPk] = { object: object, relations: {} });
    return [node, true];
  };

  const flattenedRelations = getFlattenedRelations(topCollection, relations);
  const result: Array<StorageResultTreeNode> = [];
  for (const row of rows) {
    const objects: { [collection: string]: any } = {};
    for (const [key, value] of Object.entries(row)) {
      let [collection, field] = key.split("_", 2);
      if (!field) {
        field = collection;
        collection = topCollection;
      }
      const object = (objects[collection] = objects[collection] ?? {});
      objects[collection] = object;

      object[field] = options.transformFieldValue ? options.transformFieldValue(value, field, collection) : value;
    }

    const [topNode, topNodeCreated] = getOrCreateNode(topCollection, objects[topCollection]);
    if (topNodeCreated) {
      result.push(topNode);
    }

    for (const [parentCollection, childCollection] of flattenedRelations) {
      const [parentNode] = getOrCreateNode(parentCollection, objects[parentCollection]);
      const [childNode, childNodeCreated] = getOrCreateNode(childCollection, objects[childCollection]);
      if (childNodeCreated) {
        const parentRelations = (parentNode.relations[childCollection] = parentNode.relations[childCollection] ?? []);
        parentRelations.push(childNode);
      }
    }
  }
  return result;
}

function getFlattenedRelations(parentCollection: string, relations: QueryRelations) {
  const flattened: Array<[/* parentCollection: */ string, /* childCollection: */ string]> = [];
  for (const relation of relations) {
    flattened.push([parentCollection, relation.relation]);
    if (relation.relations) {
      flattened.push(...getFlattenedRelations(relation.relation, relation.relations));
    }
  }
  return flattened;
}
