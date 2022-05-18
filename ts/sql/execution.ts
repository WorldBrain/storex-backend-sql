import { CollectionDefinition } from '@worldbrain/storex'
import { StorageResultTreeNode } from '../types'
import { StorageCollectionsDefinition } from '../types/storage-collections'
import { StorageOperation } from '../types/storage-operations'
import { timestampToISO } from '../utils'
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
        string: 'TEXT',
        timestamp: dbCapabilities.datetimeFields ? 'DATETIME' : 'TEXT',
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
                : new Date(value)
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
            object[fieldName] = timestampToISO(object[fieldName] as number)
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
        operation.operation === 'findObjects'
    ) {
        for (const [lhs, rhs] of Object.entries(operation.where)) {
            if (!(typeof rhs === 'string') || rhs.charAt(0) !== '$') {
                operation.where[lhs] = { $eq: rhs as any }
            }
        }
    }
    return operation
}

export interface ExecuteOperationDatabase {
    run(sql: string): Promise<{
        lastInsertRowId: number | bigint
    }>
    all(sql: string): Promise<any[]>
}
export type ExecuteOperationResult =
    | CreateObjectResult
    | FindObjectResult
    | FindObjectsResult
export interface CreateObjectResult {
    operation: 'createObject'
    pk: number | bigint
}
export interface FindObjectResult {
    operation: 'findObject'
    node?: StorageResultTreeNode
}
export interface FindObjectsResult {
    operation: 'findObjects'
    nodes: StorageResultTreeNode[]
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
            operation: 'createObject',
            pk: result.lastInsertRowId,
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
                operation: 'findObject',
                node: result.length ? result[0] : undefined,
            }
        } else {
            return {
                operation: 'findObjects',
                nodes: result,
            }
        }
    }
    throw new Error(
        `Don't know how to execute operation: ${JSON.stringify(operation)}`,
    )
}
