import isPlainObject from 'lodash/isPlainObject'
import {
    FindObjectOperation,
    FindObjectsOperation,
    QueryRelation,
    StorageOperation,
} from '../types/storage-operations'
import {
    SqlBinaryOp,
    SqlEqualNode,
    SqlInsertNode,
    SqlJoin,
    SqlLiteralNode,
    SqlPlaceholderNode,
    SqlSelectNode,
    SqlSource,
    SqlSourceNode,
    SqlUpdateNode,
    SqlWhereNode,
    SqlAst,
    SqlValueNode,
} from './ast-types'

export interface OperationTransformOptions {
    getFieldNames(collectionName: string): string[]
    getPkField(collectionName: string): string
    getStoredForeignKeyName(
        sourceCollection: string,
        relationName: string,
    ): string
    getStoredFieldName?(
        collectionName: string,
        fieldName: string,
    ): string | null
}
export interface TransformedSqlOperation {
    sqlAst: SqlAst
    placeholders: Array<{ position: number; name: string }>
}

interface OperationTransformContext {
    placeholdersGenerated: number
    placeholdersByName: { [name: string]: { position: number; name: string } }
    placeholders: TransformedSqlOperation['placeholders']
}

interface WhereTransformationOptions {
    collectionName: string
    hasRelations: boolean
}

function getPlaceholder(context: OperationTransformContext, name: string) {
    const existing = context.placeholdersByName[name]
    if (existing) {
        return existing
    }

    const position = ++context.placeholdersGenerated
    const placeholder = { position, name }
    context.placeholdersByName[name] = placeholder
    context.placeholders.push(placeholder)
    return placeholder
}

export function transformOperationTemplate(
    operation: StorageOperation,
    options: OperationTransformOptions,
): TransformedSqlOperation {
    const context: OperationTransformContext = {
        placeholdersGenerated: 0,
        placeholdersByName: {},
        placeholders: [],
    }
    const setValues = (
        target: { [key: string]: SqlValueNode | SqlPlaceholderNode },
        collection: string,
        values: any,
    ) => {
        for (const [objectFieldName, fieldValue] of Object.entries(values)) {
            const fieldName =
                options?.getStoredFieldName?.(collection, objectFieldName) ??
                objectFieldName
            const [isPlaceholder, placeholder] = allowPlaceholder(
                context,
                fieldValue,
            )
            target[fieldName] = isPlaceholder
                ? placeholder
                : { literal: fieldValue as any }
        }
    }
    const setWhere = (
        target: { where?: SqlWhereNode },
        operation: { where?: any },
        options?: WhereTransformationOptions,
    ) => {
        if (operation.where && Object.keys(operation.where).length) {
            target.where = transformOperationWhere(
                operation.where,
                context,
                options,
            )
        }
    }

    if (operation.operation === 'createObject') {
        const insert: SqlInsertNode['insert'] = {
            tableName: { identifier: operation.collection },
            values: {},
        }
        setValues(insert.values, operation.collection, operation.object)

        return {
            sqlAst: [{ insert }],
            placeholders: context.placeholders,
        }
    } else if (
        operation.operation === 'findObject' ||
        operation.operation === 'findObjects'
    ) {
        const select: SqlSelectNode['select'] = {
            source: { tableName: { identifier: operation.collection } },
            fields: getSelectFields(operation, options),
        }
        if (operation.relations) {
            select.joins = getSelectJoins(operation, context, options)
        }
        setWhere(select, operation, {
            collectionName: operation.collection,
            hasRelations: !!operation.relations?.length,
        })
        return {
            sqlAst: [{ select }],
            placeholders: context.placeholders,
        }
    } else if (operation.operation === 'updateObjects') {
        const update: SqlUpdateNode['update'] = {
            tableName: { identifier: operation.collection },
            updates: {},
        }
        setWhere(update, operation)
        setValues(update.updates, operation.collection, operation.updates)
        return {
            sqlAst: [{ update }],
            placeholders: context.placeholders,
        }
    } else {
        throw new Error(`Can't transform operation: ${operation.operation}`)
    }
}

function getSelectFields(
    operation: FindObjectOperation | FindObjectsOperation,
    options: OperationTransformOptions,
): SqlSelectNode['select']['fields'] {
    if (!operation.relations?.length) {
        return [{ source: { fieldName: { wildcard: true } } }]
    }

    const fields: SqlSelectNode['select']['fields'] = []
    const pushFields = (
        collection: string,
        tableAlias: string,
        fieldNames: string[],
    ) => {
        for (const fieldName of fieldNames) {
            const storedFieldName =
                options.getStoredFieldName?.(collection, fieldName) ?? fieldName
            fields.push({
                source: {
                    tableName: { identifier: tableAlias },
                    fieldName: { identifier: storedFieldName },
                    alias: { identifier: `${tableAlias}_${fieldName}` },
                },
            })
        }
    }
    pushFields(
        operation.collection,
        operation.collection,
        options.getFieldNames(operation.collection),
    )

    const pushRelationFields = (relation: QueryRelation) => {
        if (!(relation.fetch ?? true)) {
            return
        }
        pushFields(
            relation.relation,
            relation.alias ?? relation.relation,
            options.getFieldNames(relation.relation),
        )
        for (const childRelation of relation.relations ?? []) {
            pushRelationFields(childRelation)
        }
    }
    for (const relation of operation.relations) {
        pushRelationFields(relation)
    }
    return fields
}

function getSelectJoins(
    operation: FindObjectOperation | FindObjectsOperation,
    context: OperationTransformContext,
    options: OperationTransformOptions,
): SqlSelectNode['select']['joins'] {
    const joins: SqlSelectNode['select']['joins'] = []
    const pushJoin = (source: string, relation: QueryRelation) => {
        const alias = relation.alias ?? relation.relation
        const foreignKeyName = options.getStoredForeignKeyName(
            source,
            relation.relation,
        )
        const pkField = options.getPkField(source)
        const storedPkField =
            options.getStoredFieldName?.(source, pkField) ?? pkField

        const foreingKeyEquals: SqlEqualNode = {
            eq: [
                {
                    source: {
                        tableName: { identifier: alias },
                        fieldName: { identifier: foreignKeyName },
                    },
                },
                {
                    source: {
                        tableName: { identifier: source },
                        fieldName: { identifier: storedPkField },
                    },
                },
            ],
        }

        let where: SqlWhereNode
        if (relation.where) {
            where = {
                and: [
                    foreingKeyEquals,
                    transformOperationWhere(relation.where, context, {
                        collectionName: alias,
                        hasRelations: true,
                    }) as any,
                ],
            }
        } else {
            where = foreingKeyEquals
        }

        const join: SqlJoin = {
            type: 'INNER',
            tableName: { identifier: relation.relation },
            where,
        }
        if (relation.alias) {
            join.alias = { identifier: relation.alias }
        }
        joins.push(join)
        for (const childRelation of relation.relations ?? []) {
            pushJoin(relation.relation, childRelation)
        }
    }

    for (const relation of operation.relations ?? []) {
        pushJoin(operation.collection, relation)
    }
    return joins
}

function transformOperationWhere(
    whereNode: any,
    context: OperationTransformContext,
    options?: WhereTransformationOptions,
): SqlWhereNode {
    const getSourceFromShorthand = (shorthand: string): SqlSource => {
        const parts = shorthand.split('.')
        if (parts.length > 2) {
            throw new Error(`Invalid shorthand: ${shorthand}`)
        }

        if (parts.length == 2) {
            return {
                tableName: { identifier: parts[0] },
                fieldName: { identifier: parts[1] },
            }
        }
        return {
            tableName: options?.hasRelations
                ? { identifier: options.collectionName }
                : undefined,
            fieldName: { identifier: parts[0] },
        }
    }

    if (isPlainObject(whereNode)) {
        const keys = Object.keys(whereNode)
        if (keys.length === 1) {
            const key = keys[0]
            const value = whereNode[key]
            if (isPlainObject(value)) {
                const childKeys = Object.keys(value)
                if (childKeys.length === 1) {
                    const childKey = childKeys[0]
                    const op = childKey.substr(1)
                    const childValue = value[childKey]
                    const transformed: SqlBinaryOp<any> = {
                        [op]: [
                            { source: getSourceFromShorthand(key) },
                            transformOperationWhere(
                                childValue,
                                context,
                                options,
                            ) as any,
                        ],
                    }
                    return transformed as any
                }
            }

            const [isPlaceholder, placeholder] = allowPlaceholder(
                context,
                whereNode,
            )
            if (isPlaceholder) {
                return placeholder as any
            }
        } else {
            return {
                and: Object.entries(whereNode).map(
                    ([key, value]: any) =>
                        transformOperationWhere(
                            { [key]: value },
                            context,
                            options,
                        ) as any,
                ),
            }
        }
    } else if (typeof whereNode === 'string' && whereNode.charAt(0) === '$') {
        const parts = whereNode.substr(1).split('.')
        if (parts.length <= 2) {
            const sourceNode: SqlSourceNode = {
                source: {
                    tableName:
                        parts.length === 2
                            ? { identifier: parts[0] }
                            : undefined,
                    fieldName: {
                        identifier: parts.length === 2 ? parts[1] : parts[0],
                    },
                },
            }
            return sourceNode as any
        }
    } else {
        const transformed: SqlLiteralNode = { literal: whereNode }
        return transformed as any
    }

    throw new Error(
        `Can't transform operation where: ${JSON.stringify(whereNode)}`,
    )
}

function allowPlaceholder(
    context: OperationTransformContext,
    node: any,
): [false, any] | [true, SqlPlaceholderNode] {
    if (isPlainObject(node)) {
        const keys = Object.keys(node)
        const key = keys[0]
        if (key === '$placeholder') {
            return [true, transformPlaceholder(context, node[key])]
        }
    }
    return [false, node]
}

function transformPlaceholder(
    context: OperationTransformContext,
    node: any,
): SqlPlaceholderNode {
    return { placeholder: getPlaceholder(context, node) }
}
