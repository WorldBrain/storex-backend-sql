import {
  StorageCollectionDefinition,
  ChildOfRelationDefinition,
  ConnectsRelationDefinition,
  SingleChildOfRelationDefinition,
  RelationDefinition,
} from "./types/storage-collections";

interface ChildRelationPointer {
  collectionName: string;
  multi: boolean;
  relation: SingleChildOfRelationDefinition | ChildOfRelationDefinition;
}

interface ConnectionRelationPointer {
  collectionName: string;
  multi: boolean;
  relation: ConnectsRelationDefinition;
  connectionIndex: number;
}

export type RelationPointer = ChildRelationPointer | ConnectionRelationPointer;
export enum RelationDirection {
  Origin,
  Reverse,
}

export function getReverseRelationDefinitions(
  storageCollectionDefinitions: { [name: string]: StorageCollectionDefinition },
  targetCollectionName: string
) {
  const reveseRelations: {
    [collectionName: string]: Array<RelationPointer>;
  } = {};
  const addRelation = (collectionName: string, pointer: RelationPointer) => {
    if (!reveseRelations[collectionName]) {
      reveseRelations[collectionName] = [];
    }
    reveseRelations[collectionName].push(pointer);
  };

  for (const [collectionName, collectionDefinition] of Object.entries(storageCollectionDefinitions)) {
    for (const relation of collectionDefinition.relations ?? []) {
      if ("childOf" in relation && relation.childOf === targetCollectionName) {
        addRelation(collectionName, {
          collectionName,
          relation: relation,
          multi: true,
        });
      } else if ("singleChildOf" in relation && relation.singleChildOf === targetCollectionName) {
        addRelation(collectionName, {
          collectionName,
          relation: relation,
          multi: false,
        });
      } else if ("connects" in relation) {
        for (const [connectionIndex, connectingCollection] of relation.connects.entries()) {
          if (connectingCollection === targetCollectionName) {
            addRelation(collectionName, {
              multi: false,
              collectionName,
              relation: relation,
              connectionIndex,
            });
          }
        }
      }
    }
  }

  return reveseRelations;
}

export function getRelationAlias(pointer: RelationPointer, direction: RelationDirection) {
  const { relation } = pointer;
  if ("childOf" in relation || "singleChildOf" in relation) {
    const alias = direction === RelationDirection.Origin ? relation.alias : relation.reverseAlias;
    if (!alias) {
      if (direction === RelationDirection.Origin) {
        return "childOf" in relation ? relation.childOf : relation.singleChildOf;
      } else {
        return pointer.collectionName;
      }
    } else {
      return alias;
    }
  } else if (isConnectionPointer(pointer)) {
    return relation.aliases?.[pointer.connectionIndex!] ?? relation.connects[pointer.connectionIndex!];
  } else {
    console.error(`Could not get alias of unrecognized relation:`, relation);
    throw new Error(`Could not get alias of unrecognized relation`);
  }
}

export function isChildOfRelation(
  relation: RelationDefinition
): relation is ChildOfRelationDefinition | SingleChildOfRelationDefinition {
  return !isConnectsRelation(relation);
}

export function isConnectsRelation(relation: RelationDefinition): relation is ConnectsRelationDefinition {
  return "connects" in relation;
}

export function isConnectionPointer(pointer: RelationPointer): pointer is ConnectionRelationPointer {
  return isConnectsRelation(pointer.relation);
}

export function getObjectPk(collectionDefinition: StorageCollectionDefinition, object: any) {
  const pkField = getPkField(collectionDefinition);
  return object[pkField];
}

export function getPkField(collectionDefinition: StorageCollectionDefinition) {
  for (const index of collectionDefinition.indices ?? []) {
    if (index.pk) {
      return typeof index.field === "string" ? index.field : index.field.relation;
    }
  }
  return "id";
}

export function dateToISO(dateObject: Date) {
  const [date, timeWithZ] = dateObject.toISOString().split("T");
  const [time] = timeWithZ.split("Z");
  return `${date} ${time}`;
}

export function timestampToISO(miliSinceEpoch: number) {
  return dateToISO(new Date(miliSinceEpoch));
}
