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

interface SQLiteDebugConfig {
  queries?: boolean
  schema?: boolean
  results?: boolean
}
const DEBUG_BY_DEFAULT: { [Key in keyof SQLiteDebugConfig]: boolean } = {
  queries: true,
  schema: false,
  results: false,
}

export function createSQLiteStorageBackend(sqlite: SQLite3.Database, options?: {
  debug?: boolean | SQLiteDebugConfig
}) {
  const debug = (type: keyof SQLiteDebugConfig, what: string, ...args: any[]) => {
    if (!options?.debug) {
      return
    }
    if (options.debug !== true) {
      if (!(options.debug[type] ?? DEBUG_BY_DEFAULT[type])) {
        return
      }
    }
    if (DEBUG_BY_DEFAULT[type]) {
      console.log(`${what}:\n`, ...args)
    }
  }
  const database: SqlStorageBackendOptions['database'] = {
    all: async (sql) => {
      debug('queries', 'SQL ALL', sql)
      const statement = sqlite.prepare(sql)
      const result = statement.all()
      debug('results', 'SQL ALL result', result)
      return result
    },
    run: async (sql) => {
      debug('queries', 'SQL RUN', sql)
      const statement = sqlite.prepare(sql)
      const result = statement.run()
      debug('results', 'SQL RUN result', result)
      return { lastInsertRowId: result.lastInsertRowid }
    },
    transaction: async (f) => {
      debug('queries', 'SQL EXEC', 'BEGIN')
      sqlite.exec('BEGIN')
      try {
        await f()
      } catch (e) {
        debug('queries', 'SQL EXEC', 'ROLLBACK')
        sqlite.exec('ROLLBACK')
        throw e
      }
      debug('queries', 'SQL EXEC', 'COMMIT')
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
  const backend = new SqlStorageBackend({
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
        debug('schema', `SQL SCHEMA:\n\n${sql}`)
        sqlite.exec(sql)
      })
    },
  })
  return backend
}
