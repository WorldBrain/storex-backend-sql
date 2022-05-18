import expect from "expect";
import { expectIndentedEqual } from "../test-utils";
import { getInitialSchemaDiff } from "../schema-diff";
import {
  DEFAULT_SQL_NODES,
  renderForeignKeyNode,
  renderSqlAst,
  renderTestIdentifierNode,
  renderTestLiteralNode,
} from "./ast";
import { SqlAst } from "./ast-types";
import { getSqlSchemaUpdates } from "./schema";
import { StorageCollectionsDefinition } from "../types/storage-collections";

describe("SQL schemas", () => {
  it("should create an initial schema", () => {
    const collections: StorageCollectionsDefinition = {
      user: {
        version: new Date('2020-01-01'),
        fields: {
          displayName: { type: "string" },
        },
      },
      email: {
        version: new Date('2020-01-01'),
        fields: {
          address: { type: "string" },
        },
        relationships: [{ childOf: "user" }],
      },
    };
    const initialDiff = getInitialSchemaDiff(collections);
    const actualAst = getSqlSchemaUpdates(initialDiff, {
      primaryKey: { type: "INTEGER", flags: ["PRIMARY KEY"] },
      fieldTypes: {
        string: "TEXT",
      },
    });
    const expectedAst: SqlAst = [
      {
        createTable: {
          tableName: "user",
          fields: [
            ["id", { type: "INTEGER", flags: ["PRIMARY KEY"] }],
            ["displayName", { type: "TEXT", flags: ["NOT NULL"] }],
          ],
        },
      },
      {
        createTable: {
          tableName: "email",
          fields: [
            ["id", { type: "INTEGER", flags: ["PRIMARY KEY"] }],
            ["address", { type: "TEXT", flags: ["NOT NULL"] }],
            ["userId", { type: "INTEGER", flags: ["NOT NULL"] }],
          ],
          foreignKeys: [
            {
              foreignKey: {
                constraintName: "fk_email_userId",
                sourceFieldName: "userId",
                targetTableName: "user",
                targetFieldName: "id",
              },
            },
          ],
        },
      },
    ];
    expect(actualAst).toEqual(expectedAst);

    const actualRendered = renderSqlAst({
      ast: actualAst,
      nodes: {
        ...DEFAULT_SQL_NODES,
        literal: renderTestLiteralNode,
        identifier: renderTestIdentifierNode,
        foreignKey: renderForeignKeyNode({ withConstraint: true }),
      },
    });
    expectIndentedEqual(
      actualRendered,
      `
    CREATE TABLE user (
        id INTEGER PRIMARY KEY,
        displayName TEXT NOT NULL
    );
    CREATE TABLE email (
        id INTEGER PRIMARY KEY,
        address TEXT NOT NULL,
        userId INTEGER NOT NULL,
        CONSTRAINT fk_email_userId
            FOREIGN KEY (userId) REFERENCES user (id)
    );
    `
    );
  });
});
