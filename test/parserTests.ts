import "mocha"
import { assert } from "chai"
import { parse, ParseError } from "../index"

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
        assert.deepEqual(json, { x: 2 })
        assert.equal(errors.length, 0)
    })
    it("object with three properties", () => {
        const errors: Array<ParseError> = []
        const json = parse(
            { kind: "file", url: "fakeurl.json" },
            "  { \"x\": 2\n, \"\": true, \"rrr\": [] }  ",
            e => errors.push(e)
        )
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
    })
})