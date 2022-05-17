import expect from "expect";
import { diffObject, diffStringArray, defaultDifferSelector, objectArrayDiffer } from "./diff";

describe("Low-level object diff", () => {
  it("should detect added and removed keys in top-level objects", () => {
    expect(diffObject({ a: 1, b: 2 }, { b: 2, c: 3 })).toEqual({
      added: ["c"],
      removed: ["a"],
      changed: {},
    });
  });

  it("should detect changed keys in top-level objects", () => {
    expect(diffObject({ a: 1, b: 2, c: 3 }, { a: 1, b: 4, c: 3 })).toEqual({
      added: [],
      removed: [],
      changed: { b: true },
    });
  });

  it("should detect added and removed keys in nested objects", () => {
    expect(diffObject({ a: 1, b: 2, c: { d: 3, e: 4 } }, { a: 1, b: 2, c: { e: 4, f: 5 } })).toEqual({
      added: [],
      removed: [],
      changed: {
        c: {
          added: ["f"],
          removed: ["d"],
          changed: {},
        },
      },
    });
  });

  it("should diff string arrays", () => {
    expect(diffStringArray(["a", "b"], ["a", "c"])).toEqual({
      added: ["c"],
      removed: ["b"],
    });
  });

  it("should return throw an error if trying to diff a non-plain-object", () => {
    expect(() => diffObject({ a: [1, 2] }, { a: [1, 2, 3] })).toThrow(`Don't know how to diff [a]`);
  });

  it("should support custom differs", () => {
    expect(
      diffObject(
        { a: [1, 2] },
        { a: [1, 2, 3] },
        {
          getDiffer: (lhs, rhs, path) => {
            if (path.length === 1 && path[0] === "a") {
              return diffStringArray;
            } else {
              return defaultDifferSelector(lhs, rhs, path);
            }
          },
        }
      )
    ).toEqual({
      added: [],
      removed: [],
      changed: {
        a: {
          added: [3],
          removed: [],
        },
      },
    });
  });

  it("should be able to diff unordered object arrays", () => {
    expect(
      diffObject(
        { a: [{ name: "a" }, { name: "b" }] },
        { a: [{ name: "a", blub: "test" }, { name: "c" }] },
        {
          getDiffer: (lhs, rhs, path) => {
            if (path.length === 1 && path[0] === "a") {
              return objectArrayDiffer((obj) => obj["name"]);
            } else {
              return defaultDifferSelector(lhs, rhs, path);
            }
          },
        }
      )
    ).toEqual({
      added: [],
      removed: [],
      changed: {
        a: {
          added: [{ key: "c" }],
          removed: [{ key: "b" }],
          changed: [
            {
              key: "a",
              added: ["blub"],
              removed: [],
              changed: {},
            },
          ],
        },
      },
    });
  });

  it("should be able to ignore fields", () => {
    expect(
      diffObject(
        { a: [1, 2] },
        { a: [1, 2, 3] },
        {
          getDiffer: (lhs, rhs, path) => {
            if (path.length === 1 && path[0] === "a") {
              return "ignore";
            } else {
              return defaultDifferSelector(lhs, rhs, path);
            }
          },
        }
      )
    ).toEqual({
      added: [],
      removed: [],
      changed: {},
    });
  });
});
