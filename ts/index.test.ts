import * as expect from 'expect'
import SQLite3 from 'better-sqlite3'
import * as pg from 'pg'
const pgtools = require('pgtools')
import { testStorageBackend } from '@worldbrain/storex/lib/index.tests'
import { SqlStorageBackend, SqlStorageBackendOptions } from '.'
import { getInitialSchemaDiff } from './schema-diff'
import { getSqlSchemaUpdates } from './sql/schema'
import {
    DEFAULT_SQL_NODES,
    renderForeignKeyNode,
    renderInsertNode,
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
                insert: renderInsertNode({ withReturns: false }),
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

if (process.env.RUN_POSTGRESQL_TESTS === 'true') {
    describe('SQL StorageBackend integration tests with PostgreSQL', () => {
        testStorageBackend(async (context) => {
            context.cleanupFunction = async () => {}
            const dbName = `test_${Date.now().toString().replace('.', '_')}`
            const dbConfig = {
                user: 'postgres',
                host: 'localhost',
                password: 'storex',
                port: 5435,
            }
            await new Promise<void>((resolve, reject) => {
                pgtools.createdb(dbConfig, dbName, (err: Error) => {
                    err ? reject(err) : resolve()
                })
            })
            const client = new pg.Client({
                ...dbConfig,
                database: dbName,
            })

            const database: SqlStorageBackendOptions['database'] = {
                all: async (sql) => {
                    const result = await client.query(sql)
                    return result.rows
                },
                run: async (sql) => {
                    // console.log('SQL RUN: ', sql)
                    const result = await client.query(sql)
                    return { lastInsertRowId: result.rows?.[0]?.id }
                },
                transaction: async (f) => {
                    await client.query('BEGIN')
                    try {
                        await f()
                    } catch (e) {
                        await client.query('ROLLBACK')
                    }
                    await client.query('COMMIT')
                },
            }
            const sqlRenderNodes: SqlRenderNodes = {
                ...DEFAULT_SQL_NODES,
                insert: renderInsertNode({ withReturns: true }),
                literal: (node) => {
                    if (typeof node.literal === 'string') {
                        return [[0, client.escapeLiteral(node.literal)]]
                    }
                    if (node.literal === null) {
                        return [[0, 'NULL']]
                    }
                    return [[0, node.literal.toString()]]
                },
                identifier: (node) => [
                    [0, client.escapeIdentifier(node.identifier)],
                ],
                placeholder: (node) => [[0, `$${node.placeholder.index}`]],
                foreignKey: renderForeignKeyNode({ withConstraint: true }),
            }
            const dbCapabilties: DatabaseCapabilties = {
                datetimeFields: true,
                jsonFields: true,
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
                        await client.query(sql)
                    })
                },
            })
        })
    })
}
