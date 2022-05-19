import { StorageRegistry } from '@worldbrain/storex'
import * as backend from '@worldbrain/storex/lib/types/backend'
import { StorageBackendFeatureSupport } from '@worldbrain/storex/lib/types/backend-features'
import { SqlRenderNodes } from './sql/ast'
import {
    CountObjectsResult,
    CreateObjectResult,
    executeOperation,
    ExecuteOperationDatabase,
    FindObjectResult,
    FindObjectsResult,
} from './sql/execution'
import { DatabaseCapabilties } from './sql/types'
import { StorageOperation } from './types/storage-operations'
import { getPkField } from './utils'

export interface SqlStorageBackendOptions {
    onConfigure?(event: { registry: StorageRegistry }): void
    dbCapabilities: DatabaseCapabilties
    database: ExecuteOperationDatabase & {
        transaction(f: () => Promise<void>): Promise<void>
    }
    sqlRenderNodes: SqlRenderNodes
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
        resultLimiting: true,
        singleFieldSorting: true,
        multiFieldSorting: true,
    }

    private initialized = false

    constructor(private options: SqlStorageBackendOptions) {
        super()
    }

    configure(event: { registry: StorageRegistry }) {
        super.configure(event)
        this.options.onConfigure?.(event)
        event.registry.on('initialized', () => {
            this.initialized = true
        })
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

        const returnedObjects: any[] = []
        for (const object of objects) {
            const { object: newObject } = await this.createObject(
                collection,
                object,
            )
            returnedObjects.push(newObject)
        }

        return { objects: returnedObjects }
    }

    async createObject(
        collection: string,
        object: any,
        options: backend.CreateSingleOptions = {},
    ): Promise<backend.CreateSingleResult> {
        const collectionDefinition = this.registry.collections[collection]
        if (!collectionDefinition) {
            throw new Error(
                `Unknown collection for 'createObject': ${collection}`,
            )
        }
        for (const [fieldName, fieldDefinition] of Object.entries(
            collectionDefinition.fields,
        )) {
            if (fieldDefinition.optional && !(fieldName in object)) {
                object[fieldName] = null
            }
        }
        const { result } = (await this._dbOperation({
            operation: 'createObject',
            collection,
            object,
        })) as CreateObjectResult
        const pkField = getPkField(collectionDefinition)
        return { object: { ...object, [pkField]: result.pk } }
    }

    async findObjects<T>(
        collection: string,
        where: any,
        findOpts: backend.FindManyOptions = {},
    ): Promise<Array<T>> {
        const { result } = (await this._dbOperation({
            operation: 'findObjects',
            collection,
            where,
            order: findOpts.order,
            limit: findOpts.limit,
        })) as FindObjectsResult
        return result.map((node) => node.object)
    }

    async *streamObjects<T>(collection: string) {}

    async updateObjects(
        collection: string,
        where: any,
        updates: any,
        options: backend.UpdateManyOptions = {},
    ): Promise<backend.UpdateManyResult> {
        await this._dbOperation({
            operation: 'updateObjects',
            collection,
            where,
            updates,
        })
    }

    async deleteObjects(
        collection: string,
        query: any,
        options: backend.DeleteManyOptions = {},
    ): Promise<backend.DeleteManyResult> {
        await this._dbOperation({
            operation: 'deleteObjects',
            collection,
            where: query,
        })
    }

    async countObjects(collection: string, where: any) {
        const { result } = (await this._dbOperation({
            operation: 'countObjects',
            collection,
            where,
        })) as CountObjectsResult
        return result
    }

    async executeBatch(batch: backend.OperationBatch) {
        const info = {}
        const placeholders = {}
        await this.options.database.transaction(async () => {
            for (const operation of batch) {
                if (operation.operation === 'createObject') {
                    for (const { path, placeholder } of operation.replace ||
                        []) {
                        operation.args[path as string] =
                            placeholders[placeholder].id
                    }

                    const { object } = await this.createObject(
                        operation.collection,
                        operation.args,
                    )

                    if (operation.placeholder) {
                        info[operation.placeholder] = { object }
                        placeholders[operation.placeholder] = object
                    }
                } else if (operation.operation === 'updateObjects') {
                    await this.updateObjects(
                        operation.collection,
                        operation.where,
                        operation.updates,
                    )
                } else if (operation.operation === 'deleteObjects') {
                    await this.deleteObjects(
                        operation.collection,
                        operation.where,
                    )
                }
            }
        })
        return { info }
    }

    async transaction(options: { collections: string[] }, body: Function) {}

    async operation(name: string, ...args: any[]) {
        if (!this.initialized) {
            throw new Error(
                'Tried to use SQL backend without calling StorageManager.finishInitialization() first',
            )
        }
        // console.log('operation', name)
        return await super.operation(name, ...args)
    }

    async _dbOperation(operation: StorageOperation) {
        return executeOperation(
            operation,
            this.options.database,
            this.registry.collections,
            this.options.dbCapabilities,
            this.options.sqlRenderNodes,
        )
    }
}
