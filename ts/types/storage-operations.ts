export type StorageOperation =
    | CreateObjectOperation
    | CreateObjectsOperation
    | FindObjectOperation
    | FindObjectsOperation
    | UpdateObjectOperation
    | UpdateObjectsOperation
    | DeleteObjectOperation
    | DeleteObjectsOperation
    | CountObjectsOperation
    | ExecuteBatchOperation
export type OperationWhereValue =
    | ComparisonRhs
    | EqOperator
    | NeOperator
    | InOperator
    | NinOperator
    | GeOperator
    | GtOperator
    | LeOperator
    | LtOperator
export type ComparisonRhs = string | number | boolean | QueryPlaceholder
export type OrderPair = unknown[]
export type QueryRelations = QueryRelation[]
export type OperationInBatch = CreateObjectInBatch | DeleteObjectsByPkInBatch
export type OperationBatch = OperationInBatch[]

export interface StorageOperations {
    storageOperation?: StorageOperation
    [k: string]: unknown
}
export interface CreateObjectOperation {
    operation: 'createObject'
    collection: string
    object: {
        [k: string]: unknown
    }
}
export interface CreateObjectsOperation {
    operation: 'createObjects'
    collection: string
    objects: {
        [k: string]: unknown
    }[]
}
export interface FindObjectOperation {
    operation: 'findObject'
    collection: string
    where: OperationWhere
    limit?: {
        [k: string]: unknown
    }
    order?: OrderPair[]
    relations?: QueryRelations
}
export interface OperationWhere {
    [k: string]: OperationWhereValue
}
export interface EqOperator {
    $eq: ComparisonRhs
}
export interface QueryPlaceholder {
    $placeholder: string
}
export interface NeOperator {
    $ne: ComparisonRhs
}
export interface InOperator {
    $in: ComparisonRhs
}
export interface NinOperator {
    $ni: ComparisonRhs
}
export interface GeOperator {
    $ge: ComparisonRhs
}
export interface GtOperator {
    $gt: ComparisonRhs
}
export interface LeOperator {
    $le: ComparisonRhs
}
export interface LtOperator {
    $lt: ComparisonRhs
}
export interface QueryRelation {
    relation: string
    alias?: string
    where?: OperationWhere
    fetch?: boolean
    relations?: QueryRelations
}
export interface FindObjectsOperation {
    operation: 'findObjects'
    collection: string
    where: OperationWhere
    order?: OrderPair[]
    relations?: QueryRelations
}
export interface UpdateObjectOperation {
    operation: 'updateObject'
    collection: string
    where: OperationWhere
    updates: {
        [k: string]: unknown
    }
}
export interface UpdateObjectsOperation {
    operation: 'updateObjects'
    collection: string
    where: OperationWhere
    updates: {
        [k: string]: unknown
    }
}
export interface DeleteObjectOperation {
    operation: 'deleteObject'
    collection: string
    where: OperationWhere
}
export interface DeleteObjectsOperation {
    operation: 'deleteObjects'
    collection: string
    where: OperationWhere
}
export interface CountObjectsOperation {
    operation: 'countObjects'
    collection: string
    where: OperationWhere
}
export interface ExecuteBatchOperation {
    operation: 'executeBatch'
    batch: OperationBatch
}
export interface CreateObjectInBatch {
    placeholder?: string
    operation: 'createObject'
    collection: string
    object?: {
        [k: string]: unknown
    }
    parents?: {
        /**
         * This interface was referenced by `undefined`'s JSON-Schema definition
         * via the `patternProperty` ".+".
         */
        [k: string]: string
    }
}
export interface DeleteObjectsByPkInBatch {
    operation: 'deleteObjects'
    collection: string
    pks?: unknown[]
}
