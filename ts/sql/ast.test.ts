import { expectIndentedEqual } from '../test-utils'
import {
    DEFAULT_SQL_NODES,
    renderForeignKeyNode,
    renderInsertNode,
    renderSqlAst,
    renderTestIdentifierNode,
    renderTestLiteralNode,
    SqlRenderNode,
    SqlRenderNodes,
} from './ast'
import { SqlPlaceholderNode, SqlAst } from './ast-types'

export function test(params: {
    ast: SqlAst
    expected: string
    nodes?: Partial<SqlRenderNodes>
}) {
    const actual = renderSqlAst({
        ast: params.ast,
        nodes: {
            ...DEFAULT_SQL_NODES,
            insert: renderInsertNode({ withReturns: false }),
            identifier: renderTestIdentifierNode,
            literal: renderTestLiteralNode,
            ...params.nodes,
        },
    })
    expectIndentedEqual(actual, params.expected)
}

describe('SQL AST', () => {
    it(`should render INSERT`, () => {
        const dateTimeString = '2021-12-31 12:34:56.780'
        const timestamp = new Date(dateTimeString + 'Z').getTime()
        test({
            ast: [
                {
                    insert: {
                        tableName: { identifier: 'myTable' },
                        values: {
                            fieldInt: { literal: 5 },
                            fieldStr: { literal: 'test' },
                            fieldDateTime: { datetime: timestamp },
                        },
                    },
                },
            ],
            expected: `
            INSERT INTO myTable (fieldInt, fieldStr, fieldDateTime) VALUES (5, 'test', '${dateTimeString}');
            `,
        })
    })

    it('should render SELECT', () => {
        test({
            ast: [
                {
                    select: {
                        fields: [
                            {
                                source: {
                                    fieldName: { identifier: 'fieldStr' },
                                },
                            },
                        ],
                        source: { tableName: { identifier: 'myTable' } },
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
                                        { literal: 5 },
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
                                        { literal: 'foo' },
                                    ],
                                },
                            ],
                        },
                    },
                },
            ],
            expected: `
            SELECT fieldStr FROM myTable WHERE
                ((fieldInt = 5) AND (fieldStr = 'foo'));
            `,
        })
    })

    it('should SELECT with JOIN', () => {
        test({
            ast: [
                {
                    select: {
                        fields: [
                            {
                                source: {
                                    fieldName: { identifier: 'fieldStr' },
                                    alias: { identifier: 'fStr' },
                                },
                            },
                        ],
                        source: {
                            tableName: { identifier: 'firstTable' },
                            alias: { identifier: 't1' },
                        },
                        where: {
                            eq: [
                                {
                                    source: {
                                        fieldName: { identifier: 'fieldInt' },
                                    },
                                },
                                { literal: 5 },
                            ],
                        },
                        joins: [
                            {
                                side: 'LEFT',
                                type: 'OUTER',
                                tableName: { identifier: 'secondTable' },
                                alias: { identifier: 't2' },
                                where: {
                                    eq: [
                                        {
                                            source: {
                                                tableName: { identifier: 't2' },
                                                fieldName: {
                                                    identifier: 'firstTableId',
                                                },
                                            },
                                        },
                                        {
                                            source: {
                                                tableName: { identifier: 't1' },
                                                fieldName: { identifier: 'id' },
                                            },
                                        },
                                    ],
                                },
                            },
                            {
                                type: 'INNER',
                                tableName: { identifier: 'thirdTable' },
                                alias: { identifier: 't3' },
                                where: {
                                    eq: [
                                        {
                                            source: {
                                                tableName: { identifier: 't3' },
                                                fieldName: {
                                                    identifier: 'secondTableId',
                                                },
                                            },
                                        },
                                        {
                                            source: {
                                                tableName: { identifier: 't2' },
                                                fieldName: { identifier: 'id' },
                                            },
                                        },
                                    ],
                                },
                            },
                        ],
                    },
                },
            ],
            expected: `
            SELECT fieldStr AS fStr FROM firstTable t1 WHERE
                (fieldInt = 5)
            LEFT OUTER JOIN secondTable t2 ON (t2.firstTableId = t1.id)
            INNER JOIN thirdTable t3 ON (t3.secondTableId = t2.id);
            `,
        })
    })

    it('should render placeholders', () => {
        const testPlaceholder = (
            expectedPlaceholder: string,
            node: SqlRenderNode<SqlPlaceholderNode>,
        ) =>
            test({
                ast: [
                    {
                        select: {
                            fields: [
                                {
                                    source: {
                                        fieldName: { identifier: 'fieldStr' },
                                    },
                                },
                            ],
                            source: { tableName: { identifier: 'myTable' } },
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
                                            name: 'fieldInt',
                                        },
                                    },
                                ],
                            },
                        },
                    },
                ],
                nodes: {
                    placeholder: node,
                },
                expected: `
            SELECT fieldStr FROM myTable WHERE
                (fieldInt = ${expectedPlaceholder});
            `,
            })
        testPlaceholder('$1', (node) => [[0, `$${node.placeholder.position}`]]) // PostgreSQL
        testPlaceholder(':fieldInt', (node) => [
            [0, `:${node.placeholder.name}`],
        ]) // SQLite
    })

    it('should render UPDATE', () => {
        test({
            ast: [
                {
                    update: {
                        tableName: { identifier: 'myTable' },
                        where: {
                            eq: [
                                {
                                    source: {
                                        fieldName: { identifier: 'fieldInt' },
                                    },
                                },
                                { literal: 1 },
                            ],
                        },
                        updates: {
                            fieldStr: { literal: 'test' },
                        },
                    },
                },
            ],
            expected: `
            UPDATE myTable SET fieldStr = 'test' WHERE
                (fieldInt = 1);
            `,
        })
    })

    it('should render DELETE', () => {
        test({
            ast: [
                {
                    delete: {
                        tableName: { identifier: 'myTable' },
                        where: {
                            eq: [
                                { source: { fieldName: { identifier: 'id' } } },
                                { literal: 1 },
                            ],
                        },
                    },
                },
            ],
            expected: `
            DELETE FROM myTable WHERE
                (id = 1);
            `,
        })
    })

    it(`should render CREATE TABLE`, () => {
        const testCreateTable = (
            foreignKey: ReturnType<typeof renderForeignKeyNode>,
            expected: string,
        ) =>
            test({
                nodes: {
                    foreignKey,
                },
                ast: [
                    {
                        createTable: {
                            tableName: 'myTable',
                            fields: [
                                // ["id", { type: "INTEGER", flags: ["PRIMARY KEY"] }], // SQLite
                                [
                                    'id',
                                    { type: 'SERIAL', flags: ['PRIMARY KEY'] },
                                ], // PostgreSQL
                                [
                                    'fieldStr',
                                    { type: 'TEXT', flags: ['NOT NULL'] },
                                ],
                                [
                                    'parentId',
                                    { type: 'INTEGER', flags: ['NOT NULL'] },
                                ],
                            ],
                            foreignKeys: [
                                {
                                    foreignKey: {
                                        constraintName: 'fk_myTable_parent',
                                        sourceFieldName: 'parentId',
                                        targetTableName: 'parent',
                                        targetFieldName: 'id',
                                        onUpdate: 'CASCADE',
                                        onDelete: 'CASCADE',
                                    },
                                },
                                {
                                    foreignKey: {
                                        constraintName: 'fk_myTable_something',
                                        sourceFieldName: 'somethingId',
                                        targetTableName: 'something',
                                        targetFieldName: 'id',
                                    },
                                },
                            ],
                        },
                    },
                ],
                expected,
            })
        testCreateTable(
            renderForeignKeyNode({ withConstraint: true }),
            `
    CREATE TABLE myTable (
        id SERIAL PRIMARY KEY,
        fieldStr TEXT NOT NULL,
        parentId INTEGER NOT NULL,
        CONSTRAINT fk_myTable_parent
            FOREIGN KEY (parentId) REFERENCES parent (id)
            ON UPDATE CASCADE
            ON DELETE CASCADE,
        CONSTRAINT fk_myTable_something
            FOREIGN KEY (somethingId) REFERENCES something (id)
    );
    `,
        )
        testCreateTable(
            renderForeignKeyNode({ withConstraint: false }),
            `
    CREATE TABLE myTable (
        id SERIAL PRIMARY KEY,
        fieldStr TEXT NOT NULL,
        parentId INTEGER NOT NULL,
        FOREIGN KEY (parentId) REFERENCES parent (id)
            ON UPDATE CASCADE
            ON DELETE CASCADE,
        FOREIGN KEY (somethingId) REFERENCES something (id)
    );
    `,
        )
    })
})
