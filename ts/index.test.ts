import * as expect from 'expect'
import SQLite3 from 'better-sqlite3'
import * as pg from 'pg'
import { testStorageBackend } from '@worldbrain/storex/lib/index.tests'
import { SqlStorageBackend } from '.'
import { getInitialSchemaDiff } from './schema-diff'
import { getSqlSchemaUpdates } from './sql/schema'
import {
    DEFAULT_SQL_NODES,
    renderForeignKeyNode,
    renderSqlAst,
    renderTestIdentifierNode,
    renderTestLiteralNode,
    SqlRenderNodes,
} from './sql/ast'
import { ExecuteOperationDatabase } from './sql/execution'

if (process.env.SKIP_SQLITE_TESTS !== 'true') {
    describe('SQL StorageBackend integration tests with SQLite3', () => {
        testStorageBackend(async (context) => {
            context.cleanupFunction = async () => {}
            const sqlite = SQLite3(':memory:', {
                // verbose: (...args: any[]) => console.log("SQL:", ...args)
            })
            const database: ExecuteOperationDatabase = {
                all: async (sql) => {
                    const statement = sqlite.prepare(sql)
                    return statement.all()
                },
                run: async (sql) => {
                    const statement = sqlite.prepare(sql)
                    const result = statement.run()
                    return { lastInsertRowId: result.lastInsertRowid }
                },
            }
            const sqlRenderNodes: SqlRenderNodes = {
                ...DEFAULT_SQL_NODES,
                literal: renderTestLiteralNode,
                identifier: renderTestIdentifierNode,
                placeholder: (node) => [[0, `:${node.placeholder.name}`]],
                foreignKey: renderForeignKeyNode({ withConstraint: false }),
            }
            return new SqlStorageBackend({
                database,
                dbCapabilities: {
                    datetimeFields: false,
                    jsonFields: false,
                },
                sqlRenderNodes,
                onConfigure: ({ registry }) => {
                    registry.on('initialized', async () => {
                        const initialDiff = getInitialSchemaDiff(
                            registry.collections,
                        )
                        const ast = getSqlSchemaUpdates(initialDiff, {
                            primaryKey: {
                                type: 'INTEGER',
                                flags: ['PRIMARY KEY'],
                            },
                            fieldTypes: {
                                datetime: 'DATETIME',
                                string: 'TEXT',
                                boolean: 'INTEGER',
                                text: 'TEXT',
                            },
                        })
                        const sql = renderSqlAst({
                            ast,
                            nodes: sqlRenderNodes,
                        })
                        sqlite.exec(sql)
                    })
                },
            })
        })
    })
}

// if (process.env.RUN_POSTGRESQL_TESTS === 'true') {
//   describe('SQL StorageBackend integration tests with PostgreSQL', () => {
//     testStorageBackend(async (context) => {
//       context.cleanupFunction = async () => { }
//       return new SqlStorageBackend({
//       })
//     })
//   })
// }
