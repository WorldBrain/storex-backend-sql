import expect from "expect";

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
