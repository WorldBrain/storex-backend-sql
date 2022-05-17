import expect from "expect";
import { getSchemaDiff } from ".";
import { StorageCollectionsDefinition } from "../../types/schema-generated/storage-collections";
import { SchemaDiff } from "./types";

describe("Schema differ", () => {
  it("should be able to diff two schemas", async () => {
    const oldSchema: StorageCollectionsDefinition = {
      user: {
        fields: {
          firstName: { type: "string" },
          lastName: { type: "string" },
        },
        indices: [],
      },
    };
    const newSchema: StorageCollectionsDefinition = {
      user: {
        fields: {
          displayName: { type: "string" },
        },
        indices: [{ field: "displayName" }],
      },
      foo: {
        fields: {
          blub: { type: "string" },
        },
        indices: [],
      },
    };

    const expected: SchemaDiff = {
      collections: {
        added: {
          foo: {
            fields: {
              blub: { type: "string" },
            },
            indices: [],
          },
        },
        removed: [],
        changed: {
          user: {
            fields: { added: { displayName: { type: "string" } }, changed: {}, removed: ["firstName", "lastName"] },
            indices: { added: ["displayName"], removed: [] },
            relationships: { added: [], removed: [] },
          },
        },
      },
    };
    expect(getSchemaDiff(oldSchema, newSchema)).toEqual(expected);
  });
});
