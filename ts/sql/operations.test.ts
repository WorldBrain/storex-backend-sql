import expect from 'expect'
import { expectIndentedEqual } from '../test-utils'
import { StorageOperation } from '../types/storage-operations'
import * as sqlAst from './ast'
import { SqlAst } from './ast-types'
import {
    OperationTransformOptions,
    TransformedSqlOperation,
    transformOperationTemplate,
} from './operations'

function test(
    params: Partial<OperationTransformOptions> & {
        operation: StorageOperation
        expected: {
            sqlAst: SqlAst
            sqlString: string
            placeholders?: TransformedSqlOperation['placeholders']
        }
    },
) {
    const expected = { ...params.expected }
    const { sqlString: expectedSqlString } = expected
    delete (expected as any).sqlString

    const actual = transformOperationTemplate(params.operation, {
        getFieldNames: params.getFieldNames ?? (() => []),
        getPkField: params.getPkField ?? (() => 'id'),
        getStoredForeignKeyName: (sourceCollection) => `${sourceCollection}Id`,
        getFieldType: () => ``,
    })
    // console.log(require('util').inspect(actual, { depth: 10, colors: true }))
    expect(actual).toEqual(expected)

    const actualSql = sqlAst.renderSqlAst({
        ast: actual.sqlAst,
        nodes: {
            ...sqlAst.DEFAULT_SQL_NODES,
            insert: sqlAst.renderInsertNode({ withReturns: false }),
            identifier: sqlAst.renderTestIdentifierNode,
            literal: sqlAst.renderTestLiteralNode,
            placeholder: (node) => [[0, `:${node.placeholder.name}`]],
        },
    })
    expectIndentedEqual(actualSql, expectedSqlString)
}

describe('Storage operations transformation (SQL)', () => {
    it('should transform a createObject operation', () => {
        test({
            operation: {
                operation: 'createObject',
                collection: 'myCollection',
                object: {
                    fieldStr: { $placeholder: 'something' },
                    fieldInt: 5,
                    fieldBool: false,
                },
            },
            expected: {
                sqlAst: [
                    {
                        insert: {
                            tableName: { identifier: 'myCollection' },
                            values: {
                                fieldStr: {
                                    placeholder: {
                                        position: 1,
                                        name: 'something',
                                    },
                                },
                                fieldInt: { literal: 5 },
                                fieldBool: { literal: false },
                            },
                        },
                    },
                ],
                placeholders: [{ position: 1, name: 'something' }],
                sqlString: `
        INSERT INTO myCollection (fieldStr, fieldInt, fieldBool) VALUES (:something, 5, 0);
        `,
            },
        })
    })

    it('should transform a findObject operation with a single comparison', () => {
        test({
            operation: {
                operation: 'findObject',
                collection: 'myCollection',
                where: { fieldInt: { $eq: { $placeholder: 'value' } } },
            },
            expected: {
                sqlAst: [
                    {
                        select: {
                            source: {
                                tableName: { identifier: 'myCollection' },
                            },
                            fields: [
                                { source: { fieldName: { wildcard: true } } },
                            ],
                            where: {
                                eq: [
                                    {
                                        source: {
                                            fieldName: {
                                                identifier: 'fieldInt',
                                            },
                                        },
                                    },
                                    {
                                        placeholder: {
                                            position: 1,
                                            name: 'value',
                                        },
                                    },
                                ],
                            },
                        },
                    },
                ],
                placeholders: [{ position: 1, name: 'value' }],
                sqlString: `
        SELECT * FROM myCollection WHERE
            (fieldInt = :value);
        `,
            },
        })
    })

    it('should transform a findObject operation with an AND', () => {
        test({
            operation: {
                operation: 'findObject',
                collection: 'myCollection',
                where: {
                    fieldInt: { $eq: { $placeholder: 'int' } },
                    fieldStr: { $eq: { $placeholder: 'str' } },
                    fieldBool: { $eq: false },
                },
            },
            expected: {
                sqlAst: [
                    {
                        select: {
                            source: {
                                tableName: { identifier: 'myCollection' },
                            },
                            fields: [
                                { source: { fieldName: { wildcard: true } } },
                            ],
                            where: {
                                and: [
                                    {
                                        eq: [
                                            {
                                                source: {
                                                    fieldName: {
                                                        identifier: 'fieldInt',
                                                    },
                                                },
                                            },
                                            {
                                                placeholder: {
                                                    position: 1,
                                                    name: 'int',
                                                },
                                            },
                                        ],
                                    },
                                    {
                                        eq: [
                                            {
                                                source: {
                                                    fieldName: {
                                                        identifier: 'fieldStr',
                                                    },
                                                },
                                            },
                                            {
                                                placeholder: {
                                                    position: 2,
                                                    name: 'str',
                                                },
                                            },
                                        ],
                                    },
                                    {
                                        eq: [
                                            {
                                                source: {
                                                    fieldName: {
                                                        identifier: 'fieldBool',
                                                    },
                                                },
                                            },
                                            { literal: false },
                                        ],
                                    },
                                ],
                            },
                        },
                    },
                ],
                sqlString: `
        SELECT * FROM myCollection WHERE
            ((fieldInt = :int) AND (fieldStr = :str) AND (fieldBool = 0));
        `,
                placeholders: [
                    { position: 1, name: 'int' },
                    { position: 2, name: 'str' },
                ],
            },
        })
    })

    it('should transform a findObjects operation with relations', () => {
        test({
            getFieldNames: (collectionName) => {
                const fieldNames: { [collectionName: string]: string[] } = {
                    user: ['id', 'displayName'],
                    email: ['id', 'address'],
                    emailKey: ['id', 'key'],
                    attribute: ['id', 'key', 'value'],
                }
                return fieldNames[collectionName] ?? []
            },
            operation: {
                operation: 'findObjects',
                collection: 'user',
                where: {
                    id: { $eq: { $placeholder: 'userId' } },
                    'profile.active': { $eq: true },
                },
                relations: [
                    {
                        relation: 'email',
                        relations: [{ relation: 'emailKey' }],
                    },
                    {
                        alias: 'roleAttrib',
                        relation: 'attribute',
                        where: { key: { $eq: 'role' } },
                    },
                    {
                        alias: 'depAttrib',
                        relation: 'attribute',
                        where: { key: { $eq: 'department' } },
                    },
                    { fetch: false, relation: 'profile' },
                ],
            },
            expected: {
                sqlAst: [
                    {
                        select: {
                            source: { tableName: { identifier: 'user' } },
                            fields: [
                                {
                                    source: {
                                        alias: { identifier: 'user_id' },
                                        tableName: { identifier: 'user' },
                                        fieldName: { identifier: 'id' },
                                    },
                                },
                                {
                                    source: {
                                        alias: {
                                            identifier: 'user_displayName',
                                        },
                                        tableName: { identifier: 'user' },
                                        fieldName: {
                                            identifier: 'displayName',
                                        },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'email_id' },
                                        tableName: { identifier: 'email' },
                                        fieldName: { identifier: 'id' },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'email_address' },
                                        tableName: { identifier: 'email' },
                                        fieldName: { identifier: 'address' },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'emailKey_id' },
                                        tableName: { identifier: 'emailKey' },
                                        fieldName: { identifier: 'id' },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'emailKey_key' },
                                        tableName: { identifier: 'emailKey' },
                                        fieldName: { identifier: 'key' },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'roleAttrib_id' },
                                        tableName: { identifier: 'roleAttrib' },
                                        fieldName: { identifier: 'id' },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'roleAttrib_key' },
                                        tableName: { identifier: 'roleAttrib' },
                                        fieldName: { identifier: 'key' },
                                    },
                                },
                                {
                                    source: {
                                        alias: {
                                            identifier: 'roleAttrib_value',
                                        },
                                        tableName: { identifier: 'roleAttrib' },
                                        fieldName: { identifier: 'value' },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'depAttrib_id' },
                                        tableName: { identifier: 'depAttrib' },
                                        fieldName: { identifier: 'id' },
                                    },
                                },
                                {
                                    source: {
                                        alias: { identifier: 'depAttrib_key' },
                                        tableName: { identifier: 'depAttrib' },
                                        fieldName: { identifier: 'key' },
                                    },
                                },
                                {
                                    source: {
                                        alias: {
                                            identifier: 'depAttrib_value',
                                        },
                                        tableName: { identifier: 'depAttrib' },
                                        fieldName: { identifier: 'value' },
                                    },
                                },
                            ],
                            where: {
                                and: [
                                    {
                                        eq: [
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'user',
                                                    },
                                                    fieldName: {
                                                        identifier: 'id',
                                                    },
                                                },
                                            },
                                            {
                                                placeholder: {
                                                    position: 1,
                                                    name: 'userId',
                                                },
                                            },
                                        ],
                                    },
                                    {
                                        eq: [
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'profile',
                                                    },
                                                    fieldName: {
                                                        identifier: 'active',
                                                    },
                                                },
                                            },
                                            { literal: true },
                                        ],
                                    },
                                ],
                            },
                            joins: [
                                {
                                    type: 'INNER',
                                    tableName: { identifier: 'email' },
                                    where: {
                                        eq: [
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'email',
                                                    },
                                                    fieldName: {
                                                        identifier: 'userId',
                                                    },
                                                },
                                            },
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'user',
                                                    },
                                                    fieldName: {
                                                        identifier: 'id',
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                                {
                                    type: 'INNER',
                                    tableName: { identifier: 'emailKey' },
                                    where: {
                                        eq: [
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'emailKey',
                                                    },
                                                    fieldName: {
                                                        identifier: 'emailId',
                                                    },
                                                },
                                            },
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'email',
                                                    },
                                                    fieldName: {
                                                        identifier: 'id',
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                                {
                                    type: 'INNER',
                                    tableName: { identifier: 'attribute' },
                                    alias: { identifier: 'roleAttrib' },
                                    where: {
                                        and: [
                                            {
                                                eq: [
                                                    {
                                                        source: {
                                                            tableName: {
                                                                identifier:
                                                                    'roleAttrib',
                                                            },
                                                            fieldName: {
                                                                identifier:
                                                                    'userId',
                                                            },
                                                        },
                                                    },
                                                    {
                                                        source: {
                                                            tableName: {
                                                                identifier:
                                                                    'user',
                                                            },
                                                            fieldName: {
                                                                identifier:
                                                                    'id',
                                                            },
                                                        },
                                                    },
                                                ],
                                            },
                                            {
                                                eq: [
                                                    {
                                                        source: {
                                                            tableName: {
                                                                identifier:
                                                                    'roleAttrib',
                                                            },
                                                            fieldName: {
                                                                identifier:
                                                                    'key',
                                                            },
                                                        },
                                                    },
                                                    { literal: 'role' },
                                                ],
                                            },
                                        ],
                                    },
                                },
                                {
                                    type: 'INNER',
                                    tableName: { identifier: 'attribute' },
                                    alias: { identifier: 'depAttrib' },
                                    where: {
                                        and: [
                                            {
                                                eq: [
                                                    {
                                                        source: {
                                                            tableName: {
                                                                identifier:
                                                                    'depAttrib',
                                                            },
                                                            fieldName: {
                                                                identifier:
                                                                    'userId',
                                                            },
                                                        },
                                                    },
                                                    {
                                                        source: {
                                                            tableName: {
                                                                identifier:
                                                                    'user',
                                                            },
                                                            fieldName: {
                                                                identifier:
                                                                    'id',
                                                            },
                                                        },
                                                    },
                                                ],
                                            },
                                            {
                                                eq: [
                                                    {
                                                        source: {
                                                            tableName: {
                                                                identifier:
                                                                    'depAttrib',
                                                            },
                                                            fieldName: {
                                                                identifier:
                                                                    'key',
                                                            },
                                                        },
                                                    },
                                                    { literal: 'department' },
                                                ],
                                            },
                                        ],
                                    },
                                },
                                {
                                    type: 'INNER',
                                    tableName: { identifier: 'profile' },
                                    where: {
                                        eq: [
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'profile',
                                                    },
                                                    fieldName: {
                                                        identifier: 'userId',
                                                    },
                                                },
                                            },
                                            {
                                                source: {
                                                    tableName: {
                                                        identifier: 'user',
                                                    },
                                                    fieldName: {
                                                        identifier: 'id',
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                            ],
                        },
                    },
                ],
                placeholders: [{ position: 1, name: 'userId' }],
                sqlString: `
        SELECT user.id AS user_id, user.displayName AS user_displayName, email.id AS email_id, email.address AS email_address, emailKey.id AS emailKey_id, emailKey.key AS emailKey_key, roleAttrib.id AS roleAttrib_id, roleAttrib.key AS roleAttrib_key, roleAttrib.value AS roleAttrib_value, depAttrib.id AS depAttrib_id, depAttrib.key AS depAttrib_key, depAttrib.value AS depAttrib_value FROM user WHERE
            ((user.id = :userId) AND (profile.active = 1))
        INNER JOIN email ON (email.userId = user.id)
        INNER JOIN emailKey ON (emailKey.emailId = email.id)
        INNER JOIN attribute roleAttrib ON ((roleAttrib.userId = user.id) AND (roleAttrib.key = 'role'))
        INNER JOIN attribute depAttrib ON ((depAttrib.userId = user.id) AND (depAttrib.key = 'department'))
        INNER JOIN profile ON (profile.userId = user.id);
        `,
            },
        })
    })

    it('should transform an updateObjects operation', () => {
        test({
            operation: {
                operation: 'updateObjects',
                collection: 'myCollection',
                where: { fieldInt: { $eq: { $placeholder: 'oldInt' } } },
                updates: {
                    fieldStr: 'updated',
                    fieldInt: { $placeholder: 'newInt' },
                },
            },
            expected: {
                sqlAst: [
                    {
                        update: {
                            tableName: { identifier: 'myCollection' },
                            where: {
                                eq: [
                                    {
                                        source: {
                                            fieldName: {
                                                identifier: 'fieldInt',
                                            },
                                        },
                                    },
                                    {
                                        placeholder: {
                                            position: 1,
                                            name: 'oldInt',
                                        },
                                    },
                                ],
                            },
                            updates: {
                                fieldStr: { literal: 'updated' },
                                fieldInt: {
                                    placeholder: {
                                        position: 2,
                                        name: 'newInt',
                                    },
                                },
                            },
                        },
                    },
                ],
                placeholders: [
                    { position: 1, name: 'oldInt' },
                    { position: 2, name: 'newInt' },
                ],
                sqlString: `
        UPDATE myCollection SET fieldStr = 'updated', fieldInt = :newInt WHERE
            (fieldInt = :oldInt);
        `,
            },
        })
    })
})
