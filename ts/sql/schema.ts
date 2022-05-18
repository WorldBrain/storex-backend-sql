import { SchemaDiff } from '../schema-diff/types'
import { isChildOfRelation } from '../utils'
import {
    SqlStatement,
    SqlCreateTableNode,
    SqlFieldDefinitionNode,
    SqlForeinKeyNode,
} from './ast-types'

export interface SqlSchemaUpdateOptions {
    primaryKey: SqlFieldDefinitionNode
    fieldTypes: {
        [fieldType: string]: string
    }
}

export function getSqlSchemaUpdates(
    schemaDiff: SchemaDiff,
    options: SqlSchemaUpdateOptions,
): SqlStatement[] {
    const statements: SqlStatement[] = []
    for (const [collectionName, collectionDefinition] of Object.entries(
        schemaDiff.collections.added,
    )) {
        const sqlFields: Array<
            [name: string, definition: SqlFieldDefinitionNode]
        > = []

        let pkFieldName: string | undefined = undefined
        for (const index of collectionDefinition.indices ?? []) {
            if (index.pk) {
                if (typeof index.field !== 'string') {
                    throw new Error(
                        `SQL backend doesn't support non-string primary key indices yet (collection '${collectionName}')`,
                    )
                }
                pkFieldName = index.field
            }
        }

        sqlFields.push([pkFieldName ?? 'id', { ...options.primaryKey }])

        for (const [fieldName, fieldDefinition] of Object.entries(
            collectionDefinition.fields,
        )) {
            if (fieldDefinition.type === 'auto-pk') {
                continue
            }

            const fieldType = options.fieldTypes[fieldDefinition.type]
            if (!fieldType) {
                throw new Error(
                    `Don't know what type '${fieldDefinition.type}' of field ` +
                        `'${fieldName}' of collection '${collectionName}' translates to in SQL`,
                )
            }

            const flags: SqlFieldDefinitionNode['flags'] = []
            flags.push(fieldDefinition.optional ? 'NULL' : 'NOT NULL')

            sqlFields.push([fieldName, { type: fieldType, flags }])
        }

        const foreignKeys: SqlForeinKeyNode[] = []
        for (const relation of collectionDefinition.relationships ?? []) {
            if (isChildOfRelation(relation)) {
                const targetCollection =
                    'childOf' in relation
                        ? relation.childOf
                        : relation.singleChildOf
                const targetAlias = relation.alias ?? `${targetCollection}Id`
                sqlFields.push([
                    targetAlias,
                    {
                        type: 'INTEGER',
                        flags: [relation.optional ? 'NULL' : 'NOT NULL'],
                    },
                ])
                foreignKeys.push({
                    foreignKey: {
                        constraintName: `fk_${collectionName}_${targetAlias}`,
                        sourceFieldName: targetAlias,
                        targetTableName: targetCollection,
                        targetFieldName: `id`,
                    },
                })
            }
        }

        const createTable: SqlCreateTableNode['createTable'] = {
            tableName: collectionName,
            fields: sqlFields,
        }
        if (foreignKeys.length) {
            createTable.foreignKeys = foreignKeys
        }
        statements.push({ createTable })
    }
    return statements
}
