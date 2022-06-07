import * as pg from 'pg'
const pgtools = require('pgtools')
import { SqlStorageBackend, SqlStorageBackendOptions } from '.'
import { getInitialSchemaDiff } from './schema-diff'
import { getSqlSchemaUpdates } from './sql/schema'
import {
  DEFAULT_SQL_NODES,
  renderForeignKeyNode,
  renderInsertNode,
  renderSqlAst,
  SqlRenderNodes,
} from './sql/ast'
import { getSqlFieldTypes } from './sql/execution'
import { DatabaseCapabilties } from './sql/types'

export function setupPostgresTypes() {
  pg.types.setTypeParser(20, (val) => {
    const asBigInt = BigInt(val)
    const fitsNumer =
      asBigInt >= Number.MIN_SAFE_INTEGER &&
      asBigInt <= Number.MAX_SAFE_INTEGER
    return fitsNumer ? Number(asBigInt) : asBigInt
  })
}

export async function createPostgresTestDatabase(dbConfig: {
  user: string,
  host: string,
  password: string,
  port: number
}) {
  const database = `test_${Date.now().toString().replace('.', '_')}`
  await new Promise<void>((resolve, reject) => {
    pgtools.createdb(dbConfig, database, (err: Error) => {
      err ? reject(err) : resolve()
    })
  })
  return { ...dbConfig, database }
}

export function createPostgresStorageBackend(client: pg.Client) {
  const database: SqlStorageBackendOptions['database'] = {
    all: async (sql) => {
      // console.log('SQL ALL: ', sql)
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
        throw e
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
    booleanFields: true,
    datetimeFields: true,
    jsonFields: true,
  }
  return new SqlStorageBackend({
    database,
    dbCapabilities: dbCapabilties,
    sqlRenderNodes,
    onConfigure: ({ registry }) => {
      registry.on('initialized', async () => {
        await client.connect()

        const initialDiff = getInitialSchemaDiff(
          registry.collections,
        )
        const ast = getSqlSchemaUpdates(initialDiff, {
          primaryKey: {
            type: 'SERIAL',
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
}
