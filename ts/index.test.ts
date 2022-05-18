import * as expect from 'expect'
import * as sqlite3 from 'better-sqlite3'
import * as pg from 'pg'
import {
  testStorageBackend,
} from '@worldbrain/storex/lib/index.tests'
import { SqlStorageBackend } from '.'

if (process.env.SKIP_SQLITE_TESTS !== 'true') {
  describe('SQL StorageBackend integration tests with SQLite3', () => {
    testStorageBackend(async (context) => {
      context.cleanupFunction = async () => { }
      return new SqlStorageBackend({
        onConfigure: ({ registry }) => {
          registry.on('initialized', async () => {

          })
        }
      })
    })
  })
}

if (process.env.RUN_POSTGRESQL_TESTS === 'true') {
  describe('SQL StorageBackend integration tests with PostgreSQL', () => {
    testStorageBackend(async (context) => {
      context.cleanupFunction = async () => { }
      return new SqlStorageBackend({
      })
    })
  })
}