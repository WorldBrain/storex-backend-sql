import expect from "expect";
import { QueryRelations } from "../types/storage-operations";
import { transformResultsetToTree } from "./results";

describe("SQL result transformations", () => {
  it("should transform an SQL resultset into a result tree", () => {
    const relations: QueryRelations = [{ relation: "email", relations: [{ relation: "emailKey" }] }];
    const topCollection = "user";
    const rows = [
      {
        user_id: 1,
        user_displayName: "Bob",
        email_id: 1,
        email_address: "bob@bob.com",
        emailKey_id: 1,
        emailKey_key: "someKey1",
      },
      {
        user_id: 1,
        user_displayName: "Bob",
        email_id: 1,
        email_address: "bob@bob.com",
        emailKey_id: 2,
        emailKey_key: "someKey2",
      },
      {
        user_id: 1,
        user_displayName: "Bob",
        email_id: 2,
        email_address: "bob@bob2.com",
        emailKey_id: 3,
        emailKey_key: "someKey3",
      },
      {
        user_id: 2,
        user_displayName: "Alice",
        email_id: 3,
        email_address: "alice@alice.com",
        emailKey_id: 4,
        emailKey_key: "someKey4",
      },
    ];
    const result = transformResultsetToTree(rows, topCollection, relations, {
      getPkField: () => "id",
    });
    expect(result).toEqual([
      {
        object: { id: 1, displayName: "Bob" },
        relations: {
          email: [
            {
              object: { id: 1, address: "bob@bob.com" },
              relations: {
                emailKey: [
                  { object: { id: 1, key: "someKey1" }, relations: {} },
                  { object: { id: 2, key: "someKey2" }, relations: {} },
                ],
              },
            },
            {
              object: { id: 2, address: "bob@bob2.com" },
              relations: {
                emailKey: [{ object: { id: 3, key: "someKey3" }, relations: {} }],
              },
            },
          ],
        },
      },
      {
        object: { id: 2, displayName: "Alice" },
        relations: {
          email: [
            {
              object: { id: 3, address: "alice@alice.com" },
              relations: {
                emailKey: [{ object: { id: 4, key: "someKey4" }, relations: {} }],
              },
            },
          ],
        },
      },
    ]);
  });
});
