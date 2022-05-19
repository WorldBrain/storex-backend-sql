import { isPlainObject, last } from 'lodash'
import { timestampToISO } from '../utils'
import * as astTypes from './ast-types'

export type SqlRenderNode<NodeType = any> = (
    node: NodeType,
    context: SqlRenderNodeContext,
) => Array<SqlRenderableLine>
export interface SqlRenderNodes {
    literal: SqlRenderNode<astTypes.SqlLiteralNode>
    identifier: SqlRenderNode<astTypes.SqlIdentifierNode>
    [nodeTypes: string]: SqlRenderNode
}
export type SqlRenderableLine = [indent: number, content: string]
export interface SqlRenderNodeContext {
    renderNode(node: any): SqlRenderableLine[]
    renderNodeAsString(node: any): string
}

function indentRenderableLines(
    lines: SqlRenderableLine[],
): SqlRenderableLine[] {
    return lines.map((line) => [line[0] + 4, line[1]])
}

export function renderSqlAst(params: {
    ast: astTypes.SqlAst
    nodes: SqlRenderNodes
}) {
    return params.ast
        .map((node) => renderSqlNodeAsString(node, params.nodes))
        .join('\n')
}

export function renderSqlNodeAsString(node: any, nodes: SqlRenderNodes) {
    return renderSqlNode(node, nodes)
        .map(([indent, content]) => ' '.repeat(indent) + content)
        .join('\n')
}

export function renderSqlNode(
    node: any,
    nodes: SqlRenderNodes,
): SqlRenderableLine[] {
    // console.log(node)
    const nodeType = Object.keys(node)[0]
    const renderNode = nodes[nodeType]
    if (!renderNode) {
        throw new Error(`Could not render '${nodeType}' SQL node`)
    }
    return renderNode(node, {
        renderNode: (node) => {
            return renderSqlNode(node, nodes)
        },
        renderNodeAsString: (node) => {
            return renderSqlNodeAsString(node, nodes)
        },
    })
}

export const insert: SqlRenderNode<astTypes.SqlInsertNode> = (
    node,
    context,
) => {
    const tableName = context.renderNodeAsString(node.insert.tableName)
    const fieldNames = Object.keys(node.insert.values)
    const fieldList = fieldNames
        .map((fieldName) =>
            context.renderNodeAsString({ identifier: fieldName }),
        )
        .join(', ')
    const valuesList = fieldNames
        .map((fieldName) =>
            context.renderNodeAsString(node.insert.values[fieldName]),
        )
        .join(`, `)
    return [
        [0, `INSERT INTO ${tableName} (${fieldList}) VALUES (${valuesList});`],
    ]
}

export const select: SqlRenderNode<astTypes.SqlSelectNode> = (
    node,
    context,
) => {
    const fieldList = node.select.fields.map((fieldNode) => {
        const sourceNode: astTypes.SqlSourceNode = {
            source: { ...fieldNode.source, aliasType: 'as' },
        }
        return context.renderNodeAsString(sourceNode)
    })
    const tableSource: astTypes.SqlSourceNode = { source: node.select.source }
    const tableName = context.renderNodeAsString(tableSource)
    const content = `SELECT ${fieldList.join(', ')} FROM ${tableName}`
    const query = maybeWithWhere([[0, content]], node.select, context, {
        dontTerminate: true,
    })
    for (const join of node.select.joins ?? []) {
        query.push(...context.renderNode({ join }))
    }
    last(query)![1] += ';'
    return query
}

export const update: SqlRenderNode<astTypes.SqlUpdateNode> = (
    node,
    context,
) => {
    const tableName = context.renderNodeAsString(node.update.tableName)
    const assingments = Object.entries(node.update.updates)
        .map(
            ([fieldName, fieldValue]) =>
                context.renderNodeAsString({ identifier: fieldName }) +
                ' = ' +
                context.renderNodeAsString(fieldValue),
        )
        .join(', ')
    const content = `UPDATE ${tableName} SET ${assingments}`
    return maybeWithWhere([[0, content]], node.update, context)
}

export const renderDeleteNode: SqlRenderNode<astTypes.SqlDeleteNode> = (
    node,
    context,
) => {
    const tableName = context.renderNodeAsString(node.delete.tableName)
    const content = `DELETE FROM ${tableName}`
    return maybeWithWhere([[0, content]], node.delete, context)
}

export const source: SqlRenderNode<astTypes.SqlSourceNode> = (
    node,
    context,
) => {
    const { source } = node
    let fieldStr = source.fieldName
        ? context.renderNodeAsString(source.fieldName)
        : ``
    if (source.tableName) {
        const tableIdentifier = context.renderNodeAsString(source.tableName)
        if (source.fieldName) {
            fieldStr = `${tableIdentifier}.${fieldStr}`
        } else {
            fieldStr = tableIdentifier
        }
    } else if (source.functionCall) {
        fieldStr = context.renderNodeAsString({
            functionCall: source.functionCall,
        })
    }
    if (source.alias) {
        const type = node.source.aliasType ?? 'space'
        if (type === 'space') {
            fieldStr += ' '
        } else {
            fieldStr += ' AS '
        }
        fieldStr += context.renderNodeAsString(source.alias)
    }
    return [[0, fieldStr]]
}

export const join: SqlRenderNode<astTypes.SqlJoinNode> = (node, context) => {
    let content = node.join.side ?? ''
    if (node.join.side) {
        content += ' '
    }
    content += node.join.type
    content += ' JOIN '
    content += context.renderNodeAsString({ source: node.join })
    content += ' ON '
    content += context.renderNodeAsString(node.join.where)

    return [[0, content]]
}

function maybeWithWhere(
    lines: SqlRenderableLine[],
    nodeContent: { where?: astTypes.SqlWhereNode },
    context: SqlRenderNodeContext,
    options?: { dontTerminate?: boolean },
) {
    if (nodeContent.where) {
        lines[0][1] += ' WHERE'
        lines.push(
            ...indentRenderableLines(context.renderNode(nodeContent.where)),
        )
    }
    if (!options?.dontTerminate) {
        last(lines)![1] += ';'
    }
    return lines
}

export const renderTestIdentifierNode: SqlRenderNode<
    astTypes.SqlIdentifierNode
> = (node) => {
    return [[0, node.identifier]]
}

export const renderTestLiteralNode: SqlRenderNode<astTypes.SqlLiteralNode> = (
    node,
) => {
    let result: string
    if (typeof node.literal === 'string') {
        result = `'${node.literal}'`
    } else if (typeof node.literal === 'number') {
        result = node.literal.toString()
    } else {
        result = node.literal ? '1' : '0'
    }
    return [[0, result]]
}

export const datetime: SqlRenderNode<astTypes.SqlDateTimeNode> = (node) => {
    return [[0, `'${timestampToISO(node.datetime)}'`]]
}

function binaryNode(key: string, sqlOp: string) {
    const renderNode: SqlRenderNode = (node, context) => {
        const content = node[key]
            .map((operand: any) => context.renderNodeAsString(operand))
            .join(` ${sqlOp} `)
        return [[0, `(${content})`]]
    }
    return renderNode
}

export const createTable: SqlRenderNode<astTypes.SqlCreateTableNode> = (
    node,
    context,
) => {
    const lines: SqlRenderableLine[] = []
    const numFields = node.createTable.fields.length
    const numForeignKeys = node.createTable.foreignKeys?.length ?? 0
    const numItems = numFields + numForeignKeys
    for (const [
        fieldIndex,
        [fieldName, fieldDefinition],
    ] of node.createTable.fields.entries()) {
        const isLastLine = fieldIndex + 1 >= numItems
        const tralingComma = !isLastLine ? ',' : ''
        const flags = fieldDefinition.flags.join(' ')
        lines.push([
            0,
            `${fieldName} ${fieldDefinition.type} ${flags}${tralingComma}`,
        ])
    }
    for (const [fkIndex, fkNode] of (
        node.createTable.foreignKeys ?? []
    ).entries()) {
        const isLastLine = numFields + fkIndex + 1 >= numItems
        lines.push(...context.renderNode(fkNode))
        if (!isLastLine) {
            last(lines)![1] += ','
        }
    }

    return [
        [0, `CREATE TABLE ${node.createTable.tableName} (`],
        ...indentRenderableLines(lines),
        [0, `);`],
    ]
}

export const renderForeignKeyNode = (options: { withConstraint: boolean }) => {
    const render: SqlRenderNode<astTypes.SqlForeinKeyNode> = (
        node,
        context,
    ) => {
        const { foreignKey } = node
        const lines: string[] = []
        if (options.withConstraint) {
            lines.push(`CONSTRAINT ${foreignKey.constraintName}`)
        }
        lines.push(
            `FOREIGN KEY (${foreignKey.sourceFieldName}) ` +
                `REFERENCES ${foreignKey.targetTableName} ` +
                `(${foreignKey.targetFieldName})`,
        )
        if (foreignKey.onUpdate) {
            lines.push(`ON UPDATE ${foreignKey.onUpdate}`)
        }
        if (foreignKey.onDelete) {
            lines.push(`ON DELETE ${foreignKey.onDelete}`)
        }
        const renderableLines: SqlRenderableLine[] = lines.map((line) => [
            0,
            line,
        ])
        return [
            renderableLines[0],
            ...indentRenderableLines(renderableLines.slice(1)),
        ]
    }
    return render
}

function inNode(key: string, sqlOp: string) {
    const renderNode: SqlRenderNode<astTypes.SqlIn<'in' | 'nin'>> = (
        node,
        context,
    ) => {
        const [source, operands] = node[key]
        const lhs = context.renderNodeAsString(source)
        const rhs = operands
            .map((operand: any) => context.renderNodeAsString(operand))
            .join(`, `)
        return [[0, `(${lhs} ${sqlOp} (${rhs}))`]]
    }
    return renderNode
}

export function isSqlNodeType<T, U extends keyof T>(
    node: any,
    type: U,
): node is T {
    return isPlainObject(node) && type in node
}

export const functionCall: SqlRenderNode<astTypes.SqlFunctionCallNode> = (
    node,
    context,
) => {
    const args = node.functionCall.arguments.map(context.renderNodeAsString)
    return [[0, `${node.functionCall.name}(${args.join(', ')})`]]
}

export const DEFAULT_SQL_NODES: Omit<
    SqlRenderNodes,
    'literal' | 'placeholder' | 'identifier'
> = {
    insert,
    select,
    update,
    delete: renderDeleteNode,
    source,
    join,
    and: binaryNode('and', 'AND'),
    eq: binaryNode('eq', '='),
    ne: binaryNode('ne', '!='),
    in: inNode('in', 'IN'),
    nin: inNode('nin', 'NOT IN'),
    gt: binaryNode('gt', '>'),
    gte: binaryNode('gte', '>='),
    lt: binaryNode('lt', '<'),
    lte: binaryNode('lte', '<='),
    createTable,
    wildcard: () => [[0, '*']],
    datetime,
    functionCall,
}
