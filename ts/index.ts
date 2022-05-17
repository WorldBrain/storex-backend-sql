import { StorageRegistry } from '@worldbrain/storex'
import * as backend from '@worldbrain/storex/lib/types/backend'
import { StorageBackendFeatureSupport } from '@worldbrain/storex/lib/types/backend-features'

export interface SqlStorageBackendOptions {
  onConfigure?(event: { registry: StorageRegistry }): void
}

export class SqlStorageBackend extends backend.StorageBackend {
  public features: StorageBackendFeatureSupport = {
    count: true,
    // createWithRelationships: true,
    // fullTextSearch: true,
    rawCreateObjects: true,
    executeBatch: true,
    transaction: true,
    // customFields: true,
    // streamObjects: true,
  }

  private initialized = false

  constructor(private options: SqlStorageBackendOptions) {
    super()
  }

  configure(event: { registry: StorageRegistry }) {
    super.configure(event)
    this.options.onConfigure?.(event)
  }

  async rawCreateObjects(
    collection: string,
    objects: any[],
    options: backend.CreateManyOptions,
  ): Promise<backend.CreateManyResult> {
    if ((options?.withNestedObjects as boolean | undefined) === true) {
      throw Error(
        'rawCreateObjects must be called withNestedObjects equal to false. (nested and complex Objects are not supported in these low level bulk creations)',
      )
    }

    return { objects }
  }

  async createObject(
    collection: string,
    object: any,
    options: backend.CreateSingleOptions = {},
  ): Promise<backend.CreateSingleResult> {
    return { object: {} }
  }

  async findObjects<T>(
    collection: string,
    query: any,
    findOpts: backend.FindManyOptions = {},
  ): Promise<Array<T>> {
    return []
  }

  async *streamObjects<T>(collection: string) {
  }

  async updateObjects(
    collection: string,
    where: any,
    updates: any,
    options: backend.UpdateManyOptions = {},
  ): Promise<backend.UpdateManyResult> {
  }

  async deleteObjects(
    collection: string,
    query: any,
    options: backend.DeleteManyOptions = {},
  ): Promise<backend.DeleteManyResult> {
  }

  async countObjects(collection: string, query: any) {
    return 0
  }

  async executeBatch(batch: backend.OperationBatch) {
    return { info: {} }
  }

  async transaction(options: { collections: string[] }, body: Function) {
  }

  async operation(name: string, ...args: any[]) {
    if (!this.initialized) {
      throw new Error(
        'Tried to use Dexie backend without calling StorageManager.finishInitialization() first',
      )
    }
    // console.log('operation', name)
    return await super.operation(name, ...args)
  }
}
