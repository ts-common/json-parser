import "mocha"
import { assert } from "chai"
import { parse, ParseError } from "../index"
import { getInfo } from '@ts-common/source-map';
import { JsonArray } from '@ts-common/json';
import * as fs from "fs"

describe("parse", () => {
    it("empty", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "",
            e => errors.push(e)
        )
        assert.isNull(json)
        assert.equal(errors.length, 1)
        const x = errors[0]
        assert.equal(x.message, "unexpected end of file")
    })
    it("null", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "null",
            e => errors.push(e)
        )
        assert.isNull(json)
        assert.equal(errors.length, 0)
    })
    it("number", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "+234.56e-1",
            e => errors.push(e)
        )
        assert.equal(json, 23.456)
        assert.equal(errors.length, 0)
    })
    it("string", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  \"hello world!\"  ",
            e => errors.push(e)
        )
        assert.equal(json, "hello world!")
        assert.equal(errors.length, 0)
    })
    it("empty object", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  { \n }  ",
            e => errors.push(e)
        )
        assert.deepEqual(json, {})
        assert.equal(errors.length, 0)
    })
    it("empty array", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  [ \n    \n\t  ]  ",
            e => errors.push(e)
        )
        assert.deepEqual(json, [])
        assert.equal(errors.length, 0)
    })
    it("object with one property", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  { \"x\": 2\n }  ",
            e => errors.push(e)
        )
        if (json === null || typeof json !== "object") {
            throw new Error("not object")
        }
        const info = getInfo(json)
        if (info === undefined || info.kind !== "object") {
            throw new Error("info")
        }
        assert.equal(info.position.line, 0)
        assert.equal(info.position.column, 2)

        assert.equal(info.property, 0)
        const parentInfo = info.parent
        if (parentInfo.kind !== "file") {
            throw new Error("info")
        }

        assert.equal(parentInfo.url, "fakeurl.json")
        assert.deepEqual(json, { x: 2 })
        assert.equal(errors.length, 0)
    })
    it("object with three properties", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  { \"x\": 2\n, \"\": true, \"rrr\":\n\n\n \t[] }  ",
            e => errors.push(e)
        )

        const jsonRrr: JsonArray = (json as any).rrr
        const info = getInfo(jsonRrr)
        if (info === undefined || info.kind !== "object") {
            throw new Error("info")
        }
        assert.equal(info.position.line, 4)
        assert.equal(info.position.column, 2)

        assert.equal(info.property, "rrr")
        const parentInfo = info.parent
        if (parentInfo.kind !== "object") {
            throw new Error("info")
        }

        assert.equal(parentInfo.property, 0)
        const grandParentInfo = parentInfo.parent
        if (grandParentInfo.kind !== "file") {
            throw new Error("grandParentInfo")
        }

        assert.deepEqual(json, { x: 2, "": true, rrr: [] })
        assert.equal(errors.length, 0)
    })
    it("array with one item", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  [ false ]  ",
            e => errors.push(e)
        )
        assert.deepEqual(json, [false])
        assert.equal(errors.length, 0)
    })
    it("array with three items", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  [ false, { \"na::\": [ null, true] }, -456 ]  ",
            e => errors.push(e)
        )
        assert.deepEqual(json, [false, { "na::": [null, true]}, -456])
        assert.equal(errors.length, 0)

        const na = (json as any)[1]["na::"]
        const info = getInfo(na)
        if (info === undefined || info.kind !== "object") {
            throw new Error("info")
        }
        assert.equal(info.property, "na::")
    })
    it("two values", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " false true ",
            e => errors.push(e)
        )
        assert.deepEqual(json, false)
        assert.equal(errors.length, 1)
    })
    it("two tokens after value", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " {} [] ",
            e => errors.push(e)
        )
        assert.deepEqual(json, {})
        assert.equal(errors.length, 1)
    })
    it("invalid second property", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " { \"\": 4 5 }",
            e => errors.push(e)
        )
        assert.deepEqual(json, { "": 4 })
        assert.equal(errors.length, 1)
    })
    it("invalid property separator", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " { \"\" 4 }",
            e => errors.push(e)
        )
        assert.deepEqual(json, {})
        assert.isTrue(errors.length > 0)
    })
    it("invalid property name", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " { [] }",
            e => errors.push(e)
        )
        assert.deepEqual(json, {})
        assert.isTrue(errors.length > 0)
    })
    it("strange property name", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " { 45:54 }",
            e => errors.push(e)
        )
        assert.deepEqual(json, { "45": 54 })
        assert.equal(errors.length, 1)
    })
    it("null property name", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " { null:54 }",
            e => errors.push(e)
        )
        assert.deepEqual(json, { "null": 54 })
        assert.equal(errors.length, 1)
    })
    it("array with no separator", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " [ null \n +567.4e-56]",
            e => errors.push(e)
        )
        assert.deepEqual(json, [null])
        assert.equal(errors.length, 1)
    })
    it("invalid json", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            " } []",
            e => errors.push(e)
        )
        assert.deepEqual(json, [])
        assert.equal(errors.length, 1)
    })
    it("testCase", () => {
        const url = "./test/testCase9.json"
        const context = fs.readFileSync(url).toString()
        parse({ kind: "file", url: url}, context, e => { throw e })
    })
})