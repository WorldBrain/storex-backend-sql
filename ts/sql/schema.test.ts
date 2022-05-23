import expect from 'expect'
import { expectIndentedEqual } from '../test-utils'
import { getInitialSchemaDiff } from '../schema-diff'
import {
    DEFAULT_SQL_NODES,
    renderForeignKeyNode,
    renderInsertNode,
    renderSqlAst,
    renderTestIdentifierNode,
    renderTestLiteralNode,
} from './ast'
import { SqlAst } from './ast-types'
import { getSqlSchemaUpdates } from './schema'
import { StorageCollectionsDefinition } from '../types/storage-collections'

describe('SQL schemas', () => {
    it('should create an initial schema', () => {
        const collections: StorageCollectionsDefinition = {
            user: {
                version: new Date('2020-01-01'),
                fields: {
                    displayName: { type: 'string' },
                },
            },
            email: {
                version: new Date('2020-01-01'),
                fields: {
                    address: { type: 'string' },
                },
                relationships: [{ childOf: 'user' }],
            },
        }
        const initialDiff = getInitialSchemaDiff(collections)
        const actualAst = getSqlSchemaUpdates(initialDiff, {
            primaryKey: { type: 'INTEGER', flags: ['PRIMARY KEY'] },
            fieldTypes: {
                string: 'TEXT',
            },
        })
        const expectedAst: SqlAst = [
            {
                createTable: {
                    tableName: { identifier: 'user' },
                    fields: [
                        [
                            { identifier: 'id' },
                            { type: 'INTEGER', flags: ['PRIMARY KEY'] },
                        ],
                        [
                            { identifier: 'displayName' },
                            { type: 'TEXT', flags: ['NOT NULL'] },
                        ],
                    ],
                },
            },
            {
                createTable: {
                    tableName: { identifier: 'email' },
                    fields: [
                        [
                            { identifier: 'id' },
                            { type: 'INTEGER', flags: ['PRIMARY KEY'] },
                        ],
                        [
                            { identifier: 'address' },
                            { type: 'TEXT', flags: ['NOT NULL'] },
                        ],
                        [
                            { identifier: 'userId' },
                            { type: 'INTEGER', flags: ['NOT NULL'] },
                        ],
                    ],
                    foreignKeys: [
                        {
                            foreignKey: {
                                constraintName: 'fk_email_userId',
                                sourceFieldName: { identifier: 'userId' },
                                targetTableName: { identifier: 'user' },
                                targetFieldName: { identifier: 'id' },
                            },
                        },
                    ],
                },
            },
        ]
        expect(actualAst).toEqual(expectedAst)

        const actualRendered = renderSqlAst({
            ast: actualAst,
            nodes: {
                ...DEFAULT_SQL_NODES,
                insert: renderInsertNode({ withReturns: false }),
                literal: renderTestLiteralNode,
                identifier: renderTestIdentifierNode,
                foreignKey: renderForeignKeyNode({ withConstraint: true }),
            },
        })
        expectIndentedEqual(
            actualRendered,
            `
    CREATE TABLE user (
        id INTEGER PRIMARY KEY,
        displayName TEXT NOT NULL
    );
    CREATE TABLE email (
        id INTEGER PRIMARY KEY,
        address TEXT NOT NULL,
        userId INTEGER NOT NULL,
        CONSTRAINT fk_email_userId
            FOREIGN KEY (userId) REFERENCES user (id)
    );
    `,
        )
    })
})
