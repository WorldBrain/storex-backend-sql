import * as expect from 'expect'
import SQLite3 from 'better-sqlite3'
import * as pg from 'pg'
import { testStorageBackend } from '@worldbrain/storex/lib/index.tests'
import { SqlStorageBackend, SqlStorageBackendOptions } from '.'
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
import { ExecuteOperationDatabase, getSqlFieldTypes } from './sql/execution'
import { DatabaseCapabilties } from './sql/types'

if (process.env.SKIP_SQLITE_TESTS !== 'true') {
    describe('SQL StorageBackend integration tests with SQLite3', () => {
        testStorageBackend(async (context) => {
            context.cleanupFunction = async () => {}
            const sqlite = SQLite3(':memory:', {
                // verbose: (...args: any[]) => console.log("SQL:", ...args)
            })
            const database: SqlStorageBackendOptions['database'] = {
                all: async (sql) => {
                    const statement = sqlite.prepare(sql)
                    return statement.all()
                },
                run: async (sql) => {
                    // console.log('SQL RUN: ', sql)
                    const statement = sqlite.prepare(sql)
                    const result = statement.run()
                    return { lastInsertRowId: result.lastInsertRowid }
                },
                transaction: async (f) => {
                    sqlite.exec('BEGIN')
                    try {
                        await f()
                    } catch (e) {
                        sqlite.exec('ROLLBACK')
                    }
                    sqlite.exec('COMMIT')
                },
            }
            const sqlRenderNodes: SqlRenderNodes = {
                ...DEFAULT_SQL_NODES,
                literal: renderTestLiteralNode,
                identifier: renderTestIdentifierNode,
                placeholder: (node) => [[0, `:${node.placeholder.name}`]],
                foreignKey: renderForeignKeyNode({ withConstraint: false }),
            }
            const dbCapabilties: DatabaseCapabilties = {
                datetimeFields: false,
                jsonFields: false,
            }
            return new SqlStorageBackend({
                database,
                dbCapabilities: dbCapabilties,
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
                            fieldTypes: getSqlFieldTypes(dbCapabilties),
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
