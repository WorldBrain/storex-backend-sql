import isPlainObject from 'lodash/isPlainObject'
import { CollectionDefinition } from '@worldbrain/storex'
import { StorageResultTreeNode } from '../types'
import { StorageCollectionsDefinition } from '../types/storage-collections'
import { StorageOperation } from '../types/storage-operations'
import { isoToDate, timestampToISO } from '../utils'
import { isChildOfRelation, isConnectsRelation } from '../utils'
import { renderSqlAst, SqlRenderNodes } from './ast'
import {
    OperationTransformOptions,
    transformOperationTemplate,
} from './operations'
import { ResultsetTransformOptions, transformResultsetToTree } from './results'
import { SqlSchemaUpdateOptions } from './schema'
import { DatabaseCapabilties } from './types'

export function getSqlFieldTypes(
    dbCapabilities: DatabaseCapabilties,
): SqlSchemaUpdateOptions['fieldTypes'] {
    return {
        datetime: dbCapabilities.datetimeFields ? 'TIMESTAMPTZ' : 'TEXT',
        boolean: dbCapabilities.booleanFields ? 'BOOLEAN' : 'INTEGER',
        text: 'TEXT',
        int: 'INTEGER',
        float: 'REAL',
        string: 'TEXT',
        timestamp: dbCapabilities.datetimeFields ? 'TIMESTAMPTZ' : 'TEXT',
        json: dbCapabilities.jsonFields ? 'JSON' : 'TEXT',
    }
}

export function getFieldNames(collectionDefinition: CollectionDefinition) {
    const objectFieldNames = Object.keys(collectionDefinition.fields)
    const relationFieldNames: string[] = []
    for (const relation of collectionDefinition.relationships ?? []) {
        if (isChildOfRelation(relation)) {
            relationFieldNames.push(
                relation.alias ??
                    ('childOf' in relation
                        ? relation.childOf
                        : relation.singleChildOf) + 'Id',
            )
        } else if (isConnectsRelation(relation)) {
            relationFieldNames.push(
                relation.aliases?.[0] ?? relation.connects[0] + 'Id',
            )
            relationFieldNames.push(
                relation.aliases?.[1] ?? relation.connects[1] + 'Id',
            )
        }
    }
    return ['id', ...objectFieldNames, ...relationFieldNames]
}

export function getPkField() {
    return 'id'
}

export function getOperationTransformationOptions(
    storageCollections: StorageCollectionsDefinition,
): OperationTransformOptions {
    return {
        getPkField,
        getFieldNames: (collectionName) => {
            const collectionDefinition = storageCollections[collectionName]
            return getFieldNames(collectionDefinition)
        },
        getStoredForeignKeyName: (source) => `${source}Id`,
        getFieldType: (collectionName, fieldName) => {
            const collectionDefinition = storageCollections[collectionName]
            const fieldDefinition = collectionDefinition.fields[fieldName]
            if (!fieldDefinition) {
                throw new Error(
                    `No such field in collection '${collectionName}': ${fieldName}`,
                )
            }
            return fieldDefinition.type
        },
    }
}

export function getTransformResultValue(
    storageCollections: StorageCollectionsDefinition,
    dbCapabilities: DatabaseCapabilties,
) {
    const transform: ResultsetTransformOptions['transformFieldValue'] = (
        value,
        fieldName,
        collectionName,
    ) => {
        const collectionDefinition = storageCollections[collectionName]
        const fieldDefinition = collectionDefinition.fields[fieldName]
        if (!fieldDefinition) {
            return value
        }
        if (fieldDefinition.type === 'timestamp') {
            const dateObject = dbCapabilities.datetimeFields
                ? value
                : isoToDate(value)
            return dateObject.getTime()
        }
        if (fieldDefinition.type === 'json' && !dbCapabilities.jsonFields) {
            return JSON.parse(value)
        }
        if (fieldDefinition.type === 'boolean') {
            return !!value
        }
        return value
    }
    return transform
}

export function prepareObjectForWrite(
    object: any,
    fields: CollectionDefinition['fields'],
    options: DatabaseCapabilties,
) {
    for (const [fieldName, fieldDefinition] of Object.entries(fields)) {
        if (!(fieldName in object)) {
            continue
        }
        if (fieldDefinition.type === 'timestamp') {
            object[fieldName] = options.datetimeFields
                ? new Date(object[fieldName]).toISOString()
                : timestampToISO(object[fieldName] as number)
        }
        if (fieldDefinition.type === 'json' && !options.jsonFields) {
            object[fieldName] = JSON.stringify(object[fieldName])
        }
    }
}

export function prepareStorageOperation(
    operation: StorageOperation,
    storageCollections: StorageCollectionsDefinition,
    dbCapabilities: DatabaseCapabilties,
) {
    if (operation.operation == 'createObject') {
        const collectionDefinition = storageCollections[operation.collection]
        prepareObjectForWrite(
            operation.object,
            collectionDefinition.fields,
            dbCapabilities,
        )
    } else if (
        operation.operation === 'findObject' ||
        operation.operation === 'findObjects' ||
        operation.operation === 'updateObjects' ||
        operation.operation === 'countObjects' ||
        operation.operation === 'deleteObjects'
    ) {
        for (const [lhs, rhs] of Object.entries(operation.where ?? {})) {
            if (!isPlainObject(rhs)) {
                operation.where[lhs] = { $eq: rhs as any }
            }
        }
    }
    return operation
}

export interface ExecuteOperationDatabase {
    run(sql: string): Promise<{
        lastInsertRowId?: number | bigint
    }>
    all(sql: string): Promise<any[]>
}
export type ExecuteOperationResult =
    | CreateObjectResult
    | FindObjectResult
    | FindObjectsResult
    | CountObjectsResult
    | UpdateObjectsResult
    | DeleteObjectsResult
export interface CreateObjectResult {
    operation: 'createObject'
    result: { pk: number | bigint }
}
export interface FindObjectResult {
    operation: 'findObject'
    result: StorageResultTreeNode | null
}
export interface FindObjectsResult {
    operation: 'findObjects'
    result: StorageResultTreeNode[]
}
export interface CountObjectsResult {
    operation: 'countObjects'
    result: number
}
export interface UpdateObjectsResult {
    operation: 'updateObjects'
}
export interface DeleteObjectsResult {
    operation: 'deleteObjects'
}

export async function executeOperation(
    operation: StorageOperation,
    database: ExecuteOperationDatabase,
    storageCollections: StorageCollectionsDefinition,
    dbCapabilities: DatabaseCapabilties,
    sqlNodes: SqlRenderNodes,
): Promise<ExecuteOperationResult> {
    operation = prepareStorageOperation(
        operation,
        storageCollections,
        dbCapabilities,
    )
    const transformed = transformOperationTemplate(
        operation,
        getOperationTransformationOptions(storageCollections),
    )
    const sql = renderSqlAst({ ast: transformed.sqlAst, nodes: sqlNodes })
    if (operation.operation === 'createObject') {
        const result = await database.run(sql)
        return {
            operation: operation.operation,
            result: { pk: result.lastInsertRowId! },
        }
    }
    if (
        operation.operation === 'findObject' ||
        operation.operation === 'findObjects'
    ) {
        const rows = await database.all(sql)
        const result = transformResultsetToTree(
            rows,
            operation.collection,
            operation.relations ?? [],
            {
                getPkField,
                transformFieldValue: getTransformResultValue(
                    storageCollections,
                    dbCapabilities,
                ),
            },
        )
        if (operation.operation === 'findObject') {
            return {
                operation: operation.operation,
                result: result.length ? result[0] : null,
            }
        } else {
            return {
                operation: operation.operation,
                result: result,
            }
        }
    }
    if (operation.operation === 'countObjects') {
        const [{ count }] = await database.all(sql)
        return {
            operation: operation.operation,
            result: count,
        }
    }
    if (operation.operation === 'updateObjects') {
        await database.run(sql)
        return {
            operation: operation.operation,
        }
    }
    if (operation.operation === 'deleteObjects') {
        await database.run(sql)
        return {
            operation: operation.operation,
        }
    }
    throw new Error(
        `Don't know how to execute operation: ${JSON.stringify(operation)}`,
    )
}
