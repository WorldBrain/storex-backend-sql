import isBoolean from "lodash/isBoolean";
import isNumber from "lodash/isNumber";
import isString from "lodash/isString";
import isPlainObject from "lodash/isPlainObject";
import find from "lodash/find";
import { ObjectPath } from "../types";

export type DifferContext = { getDiffer?: DifferSelector; path: ObjectPath };
export type Differ<T = any> = (lhs: T, rhs: T, context: DifferContext) => any;
export type DifferSelector<T = any> = (lhs: T, rhs: T, path: ObjectPath) => Differ | "ignore";

export function defaultDifferSelector(lhs: any, rhs: any, path: ObjectPath) {
  if (isPlainObject(lhs)) {
    return diffObject;
  } else if (isString(lhs) || isNumber(lhs) || isBoolean(lhs)) {
    return (lhs: any, rhs: any) => lhs !== rhs;
  } else {
    throw new Error(`Don't know how to diff [${path.join(" -> ")}]`);
  }
}

export function diffObject(lhs: any, rhs: any, context?: Partial<DifferContext>) {
  context = { getDiffer: defaultDifferSelector, path: [], ...(context || {}) };

  const { added, removed, stable } = _diffStringArrayWithStable(Object.keys(lhs), Object.keys(rhs));
  const changed: { [key: string]: any } = {};
  for (const key of stable) {
    const childLhs = lhs[key as string];
    const childRhs = rhs[key as string];

    const subPath = [...context.path!, key];
    const differ = context.getDiffer!(childLhs, childRhs, subPath);
    if (differ === "ignore") {
      continue;
    }

    const diff = differ(childLhs, childRhs, { ...context, path: subPath });
    if (diff === true) {
      changed[key as string] = true;
    } else if (diff !== false && !isEmptyDiff(diff)) {
      changed[key as string] = diff;
    }
  }

  return { added: [...added], removed: [...removed], changed };
}

export function diffStringArray(lhs: string[], rhs: any[]) {
  const { added, removed } = _diffStringArrayWithStable(lhs, rhs);
  return { added: [...added], removed: [...removed] };
}

export function objectArrayDiffer(getKey: (obj: { [key: string]: any }) => string) {
  return (lhs: { [key: string]: any }, rhs: { [key: string]: any }, context: DifferContext) => {
    const { added, removed, stable } = _diffStringArrayWithStable(
      lhs.map((obj: { [key: string]: any }) => getKey(obj)),
      rhs.map((obj: { [key: string]: any }) => getKey(obj))
    );

    const changed = [];
    for (const key of stable) {
      const childLhs = find(lhs, (obj) => getKey(obj) === key);
      const childRhs = find(rhs, (obj) => getKey(obj) === key);

      const subPath = [...context.path, key];
      const diff = diffObject(childLhs, childRhs, { ...context, path: subPath });
      if (!isEmptyDiff(diff)) {
        changed.push({ key, ...diff });
      }
    }

    return {
      added: [...added].map((key) => ({ key })),
      removed: [...removed].map((key) => ({ key })),
      changed,
    };
  };
}

export function _diffStringArrayWithStable(lhs: string[], rhs: string[]) {
  const lhsSet = new Set(lhs);
  const rhsSet = new Set(rhs);
  const added = new Set([...rhsSet].filter((val) => !lhsSet.has(val)));
  const removed = new Set([...lhsSet].filter((val) => !rhsSet.has(val)));
  const stable = new Set([...rhsSet].filter((val) => lhsSet.has(val)));
  return { added, removed, stable };
}

export function isEmptyDiff(diff: any) {
  return !(diff.added || []).length && !(diff.removed || []).length && !Object.keys(diff.changed || {}).length;
}
