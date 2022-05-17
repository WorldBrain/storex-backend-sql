import expect from "expect";
import cloneDeep from "lodash/cloneDeep";
import mapValues from "lodash/mapValues";
import { Component, Components } from "./components/types";
import { makeDefinitions } from "./definition-registry";
import { Element, Elements } from "./elements/types";
import { DataFetcher } from "./types";

export function makeComponents(components: { [path: string]: Omit<Component, "name" | "path"> }): Components {
  return makeDefinitions(components);
}

export function makeElements(elements: { [name: string]: Omit<Element, "name" | "path"> }): Elements {
  return mapValues(elements, (element, name) => ({
    ...element,
    name: name,
    path: "/elements/" + name,
  }));
}

export function fakeDataFetcher(params: { elements: Elements; components: Components }): DataFetcher {
  return async (path) => {
    if (path.startsWith("/elements/")) {
      const key = path.slice("/elements/".length).slice(0, -".del.yaml".length);
      return cloneDeep(params.elements[key].definition) as any;
    } else {
      path = path.slice(0, -".dco.yaml".length);
      return cloneDeep(params.components[path].definition) as any;
    }
  };
}

function normalizeWithSpace(s: string): string {
  return s
    .replace(/^\s+$/gm, "") // collapse lines with only spaces
    .split("\n")
    .map((line) => line.trimRight())
    .join("\n");
}

function stripIndent(s: string) {
  s = s.replace(/^\n+/, "");
  s = s.trimRight();
  const leadingWhitespaceCount = s.search(/\S/);
  return s
    .split("\n")
    .map((line) => line.substr(leadingWhitespaceCount))
    .join("\n");
}

export function expectIndentedEqual(actual: string, expected: string) {
  actual = normalizeWithSpace(stripIndent(actual));
  expected = normalizeWithSpace(stripIndent(expected));
  expect(actual).toEqual(expected);
}
