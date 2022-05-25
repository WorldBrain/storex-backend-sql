import SQLite3 from 'better-sqlite3'
import * as pg from 'pg'
const pgtools = require('pgtools')
// const pgformat = require('pg-format')
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
import { createSQLiteStorageManager } from './sqlite'
import { createPostgresStorageManager, createPostgresTestDatabase, setupPostgresTypes } from './postgres'

if (process.env.SKIP_SQLITE_TESTS !== 'true') {
    describe('SQL StorageBackend integration tests with SQLite3', () => {
        testStorageBackend(async (context) => {
            context.cleanupFunction = async () => { }
            const sqlite = SQLite3(':memory:', {
                // verbose: (...args: any[]) => console.log("SQL:", ...args)
            })
            return createSQLiteStorageManager(sqlite)
        })
    })
}

if (process.env.RUN_POSTGRESQL_TESTS === 'true') {
    describe('SQL StorageBackend integration tests with PostgreSQL', () => {
        setupPostgresTypes()
        testStorageBackend(async (context) => {
            const dbConfig = await createPostgresTestDatabase({
                user: 'postgres',
                host: 'localhost',
                password: 'storex',
                port: 5435,
            })
            const client = new pg.Client(dbConfig)
            context.cleanupFunction = async () => {
                await client.end()
            }
            return createPostgresStorageManager(client)
        })
    })
}
