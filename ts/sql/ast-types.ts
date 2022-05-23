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
        order?: Array<{
            source: SqlSourceNode['source']
            direction: 'ASC' | 'DESC'
        }>
        limit?: SqlLiteralNode
    }
}
export interface SqlSource {
    functionCall?: SqlFunctionCallNode['functionCall']
    fieldName?: SqlIdentifierNode | SqlWildcardNode
    tableName?: SqlIdentifierNode
    alias?: SqlIdentifierNode
    aliasType?: 'as' | 'space'
}
export interface SqlFunctionCallNode {
    functionCall: {
        name: string
        arguments: Array<SqlSourceNode | SqlLiteralNode>
    }
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

export type SqlIn<Op extends 'in' | 'nin'> = {
    [key in Op]: [
        SqlSourceNode,
        Array<SqlSourceNode | SqlValueNode | SqlPlaceholderNode>,
    ]
}
export type SqlInNode = SqlIn<'in'>
export type SqlNotInNode = SqlIn<'nin'>

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
        where?: SqlWhereNode
    }
}

export interface SqlCreateTableNode {
    createTable: {
        tableName: SqlIdentifierNode
        fields: Array<
            [name: SqlIdentifierNode, definition: SqlFieldDefinitionNode]
        >
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
        sourceFieldName: SqlIdentifierNode
        targetTableName: SqlIdentifierNode
        targetFieldName: SqlIdentifierNode
        onUpdate?: string
        onDelete?: string
    }
}
