import SQLite3 from 'better-sqlite3'
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
import { getSqlFieldTypes } from './sql/execution'
import { DatabaseCapabilties } from './sql/types'

export function createSQLiteStorageManager(sqlite: SQLite3.Database) {
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
    booleanFields: false,
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
}
