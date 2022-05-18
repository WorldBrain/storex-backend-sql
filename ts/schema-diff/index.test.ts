import expect from "expect";
import { getSchemaDiff } from ".";
import { StorageCollectionsDefinition } from "../types/storage-collections";
import { SchemaDiff } from "./types";

describe("Schema differ", () => {
  it("should be able to diff two schemas", async () => {
    const oldSchema: StorageCollectionsDefinition = {
      user: {
        version: new Date('2020-01-01'),
        fields: {
          firstName: { type: "string" },
          lastName: { type: "string" },
        },
        indices: [],
      },
    };
    const newSchema: StorageCollectionsDefinition = {
      user: {
        version: new Date('2020-01-02'),
        fields: {
          displayName: { type: "string" },
        },
        indices: [{ field: "displayName" }],
      },
      foo: {
        version: new Date('2020-01-02'),
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
            version: new Date('2020-01-02'),
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
