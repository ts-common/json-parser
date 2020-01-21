import { JsonArray } from "@ts-common/json";
import { getInfo, objectInfoSymbol } from "@ts-common/source-map";
import * as assert from "assert";
import * as fs from "fs";
import { parse, ParseError } from "../index";

describe("parse", () => {
  it("empty", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", "", e => errors.push(e));
    assert.strictEqual(json, null);
    assert.equal(errors.length, 1);
    const x = errors[0];
    assert.equal(x.code, "unexpected end of file");
    assert.equal(
      x.message,
      "unexpected end of file, token: , line: 1, column: 1"
    );
  });
  it("null", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", "null", e => errors.push(e));
    assert.strictEqual(json, null);
    assert.equal(errors.length, 0);
  });
  it("number", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", "+234.56e-1", e => errors.push(e));
    assert.equal(json, 23.456);
    assert.equal(errors.length, 0);
  });
  it("string", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", '  "hello world!"  ', e =>
      errors.push(e)
    );
    assert.equal(json, "hello world!");
    assert.equal(errors.length, 0);
  });
  it("empty object", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", "  { \n }  ", e => errors.push(e));
    assert.deepEqual(json, {});
    assert.equal(errors.length, 0);
  });
  it("empty array", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", "  [ \n    \n\t  ]  ", e =>
      errors.push(e)
    );
    assert.deepEqual(json, []);
    assert.equal(errors.length, 0);
  });
  it("object with one property", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", '  { "x": 2\n }  ', e => errors.push(e));
    if (json === null || typeof json !== "object") {
      throw new Error("not object");
    }
    const info = getInfo(json);
    if (info === undefined || info.isChild) {
      throw new Error("info");
    }
    assert.equal(info.position.line, 1);
    assert.equal(info.position.column, 3);

    assert.equal(info.url, "fakeurl.json");
    assert.deepEqual(json, { x: 2 });
    assert.equal(errors.length, 0);
  });
  it("object with three properties", () => {
    const errors: ParseError[] = [];
    const json = parse(
      "fakeurl.json",
      '  { "x": 2\n, "": true, "rrr":\n\n\n \t[] }  ',
      e => errors.push(e)
    );

    const jsonRrr: JsonArray = (json as any).rrr;
    const info = getInfo(jsonRrr);
    if (info === undefined || !info.isChild) {
      throw new Error("info");
    }
    assert.equal(info.position.line, 5);
    assert.equal(info.position.column, 3);

    assert.equal(info.property, "rrr");
    const parentInfo = info.parent[objectInfoSymbol]();
    if (parentInfo.isChild) {
      throw new Error("info");
    }

    assert.deepEqual(json, { x: 2, "": true, rrr: [] });
    assert.equal(errors.length, 0);
  });
  it("array with one item", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", "  [ false ]  ", e => errors.push(e));
    assert.deepEqual(json, [false]);
    assert.equal(errors.length, 0);
  });
  it("array with three items", () => {
    const errors: ParseError[] = [];
    const json = parse(
      "fakeurl.json",
      '  [ false, { "na::": [ null, true] }, -456 ]  ',
      e => errors.push(e)
    );
    assert.deepEqual(json, [false, { "na::": [null, true] }, -456]);
    assert.equal(errors.length, 0);

    const na = (json as any)[1]["na::"];
    const info = getInfo(na);
    if (info === undefined || !info.isChild) {
      throw new Error("info");
    }
    assert.equal(info.property, "na::");
  });
  it("two values", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", " false true ", e => errors.push(e));
    assert.deepEqual(json, false);
    assert.equal(errors.length, 1);
    const error = errors[0];
    assert.equal(error.code, "unexpected token");
    assert.equal(
      error.message,
      "unexpected token, token: true, line: 1, column: 8"
    );
  });
  it("two tokens after value", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", " {} [] ", e => errors.push(e));
    assert.deepEqual(json, {});
    assert.equal(errors.length, 1);
  });
  it("invalid second property", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", ' { "": 4 5 }', e => errors.push(e));
    assert.deepEqual(json, { "": 4 });
    assert.equal(errors.length, 1);
  });
  it("invalid property separator", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", ' { "" 4 }', e => errors.push(e));
    assert.deepEqual(json, {});
    assert.strictEqual(errors.length > 0, true);
  });
  it("invalid property name", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", " { [] }", e => errors.push(e));
    assert.deepEqual(json, {});
    assert.strictEqual(errors.length > 0, true);
  });
  it("strange property name", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", " { 45:54 }", e => errors.push(e));
    assert.deepEqual(json, { 45: 54 });
    assert.equal(errors.length, 1);
  });
  it("null property name", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", " { null:54 }", e => errors.push(e));
    assert.deepEqual(json, { null: 54 });
    assert.equal(errors.length, 1);
  });
  it("array with no separator", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", " [ null \n +567.4e-56]", e =>
      errors.push(e)
    );
    assert.deepEqual(json, [null]);
    assert.equal(errors.length, 1);
  });
  it("invalid json", () => {
    const errors: ParseError[] = [];
    const json = parse("fakeurl.json", " } []", e => errors.push(e));
    assert.deepEqual(json, []);
    assert.equal(errors.length, 1);
  });
  it("testCase 9", () => {
    const url = "./src/test/testCase9.json";
    const context = fs.readFileSync(url).toString();
    parse(url, context, e => {
      throw e;
    });
  });
  it("missing curly brace testCase 10", () => {
    const url = "./src/test/testCase10.json";
    const errors: Array<ParseError> = [];
    const context = fs.readFileSync(url).toString();
    parse(url, context, e => {
      errors.push(e);
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "unexpected end of file");
  });
  it("json object missing curly brace ", () => {
    const errors: Array<ParseError> = [];
    parse("fakeurl.json", "{", e => {
      errors.push(e);
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "unexpected end of file");
    assert.equal(errors[0].token, "}");
  });
  it("json array missing bracket ", () => {
    const errors: Array<ParseError> = [];
    parse("fakeurl.json", "[", e => {
      errors.push(e);
    });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].code, "unexpected end of file");
    assert.equal(errors[0].token, "]");
  });
});
