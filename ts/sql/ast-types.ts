export type SqlAst = SqlStatement[]
export type SqlStatement =
    | SqlInsertNode
    | SqlSelectNode
    | SqlUpdateNode
    | SqlDeleteNode
    | SqlCreateTableNode
export interface SqlInsertNode {
    insert: {
        tableName: SqlIdentifierNode
        values: { [fieldName: string]: SqlValueNode | SqlPlaceholderNode }
    }
}

export interface SqlSelectNode {
    select: {
        fields: Array<SqlSourceNode>
        source: SqlSource
        where?: SqlWhereNode
        joins?: Array<SqlJoin>
    }
}
export interface SqlSource {
    fieldName?: SqlIdentifierNode | SqlWildcardNode
    tableName?: SqlIdentifierNode
    alias?: SqlIdentifierNode
    aliasType?: 'as' | 'space'
}
export interface SqlSourceNode {
    source: SqlSource
}
export type SqlJoin = SqlSource & {
    side?: 'LEFT' | 'RIGHT'
    type: 'INNER' | 'OUTER'
    tableName: SqlIdentifierNode
    alias?: SqlIdentifierNode
    where: SqlWhereNode
}
export interface SqlJoinNode {
    join: SqlJoin
}
export interface SqlIdentifierNode {
    identifier: string
}
export interface SqlWildcardNode {
    wildcard: true
}
export type SqlWhereNode = SqlAndNode | SqlCompareNode
export interface SqlAndNode {
    and: SqlCompareNode[]
}
export type SqlCompareNode =
    | SqlEqualNode
    | SqlNotEqualNode
    | SqlLessThanNode
    | SqlLessEqualNode
    | SqlGreaterThanNode
    | SqlGreaterEqualNode
    | SqlInNode
    | SqlNotInNode
export type SqlEqualNode = SqlBinaryOp<'eq'>
export type SqlNotEqualNode = SqlBinaryOp<'ne'>
export type SqlLessThanNode = SqlBinaryOp<'lt'>
export type SqlLessEqualNode = SqlBinaryOp<'lte'>
export type SqlGreaterThanNode = SqlBinaryOp<'gt'>
export type SqlGreaterEqualNode = SqlBinaryOp<'gte'>
export type SqlInNode = SqlBinaryOp<'in'>
export type SqlNotInNode = SqlBinaryOp<'nin'>

export type SqlValueNode = SqlLiteralNode | SqlDateTimeNode | SqlJsonNode
export interface SqlLiteralNode {
    literal: number | string | boolean | null
}
export interface SqlDateTimeNode {
    datetime: number
}
export interface SqlJsonNode {
    json: any
}
export interface SqlPlaceholderNode {
    placeholder: { position: number; name: string }
}
export type SqlBinaryOp<Key extends string> = {
    [key in Key]: [
        SqlSourceNode,
        SqlSourceNode | SqlValueNode | SqlPlaceholderNode,
    ]
}
export interface SqlUpdateNode {
    update: {
        tableName: SqlIdentifierNode
        where?: SqlWhereNode
        updates: {
            [fieldName: string]: SqlValueNode | SqlPlaceholderNode
        }
    }
}
export interface SqlDeleteNode {
    delete: {
        tableName: SqlIdentifierNode
        where: SqlWhereNode
    }
}

export interface SqlCreateTableNode {
    createTable: {
        tableName: string
        fields: Array<[name: string, definition: SqlFieldDefinitionNode]>
        foreignKeys?: SqlForeinKeyNode[]
    }
}
export interface SqlFieldDefinitionNode {
    type: string
    flags: string[]
}
export interface SqlForeinKeyNode {
    foreignKey: {
        constraintName: string
        sourceFieldName: string
        targetTableName: string
        targetFieldName: string
        onUpdate?: string
        onDelete?: string
    }
}
