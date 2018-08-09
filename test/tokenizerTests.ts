import "mocha"
import { assert } from "chai"
import { tokenize, ParseError } from "../index"
import { toArray } from "@ts-common/iterator"

describe("tokenize", () => {
    it("empty", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("", e => errors.push(e))) as any[]
        assert.sameMembers(result, [])
        assert.equal(errors.length, 0)
    })
    it("spaces", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("   \t\n   ", e => errors.push(e))) as any[]
        assert.sameMembers(result, [])
        assert.equal(errors.length, 0)
    })
    it("string", () => {
        const errors: ParseError[] = []
        const ir = tokenize(" \"xxx\"   ", e => errors.push(e))
        const result = toArray(ir)
        assert.equal(result.length, 1)
        const token = result[0]
        if (token.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token.value, "xxx")
        assert.equal(token.position.line, 0)
        assert.equal(token.position.column, 1)
        assert.equal(errors.length, 0)
    })
    it("stringEscape", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize(" \n  \"xx\\\"x\"   ", e => errors.push(e)))
        assert.equal(result.length, 1)
        const token = result[0]
        if (token.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token.value, "xx\"x")
        assert.equal(token.position.line, 1)
        assert.equal(token.position.column, 2)
        assert.equal(errors.length, 0)
    })
    it("symbol", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize(" \r\n\t  {   ", e => errors.push(e)))
        assert.equal(result.length, 1)
        const token = result[0]
        assert.equal(token.kind, "{")
        assert.equal(token.position.line, 1)
        assert.equal(token.position.column, 3)
        assert.equal(errors.length, 0)
    })
    it("true and false", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize(" \r\n\n\t   true  false ", e => errors.push(e)))
        assert.equal(result.length, 2)
        const token0 = result[0]
        if (token0.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token0.position.line, 2)
        assert.equal(token0.position.column, 4)
        assert.isTrue(token0.value)
        const token1 = result[1]
        if (token1.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token1.position.line, 2)
        assert.equal(token1.position.column, 10)
        assert.isFalse(token1.value)
        assert.equal(errors.length, 0)
    })
    it("symbol and numbers", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("-234,56.78", e => errors.push(e)))
        assert.equal(result.length, 3)
        const token0 = result[0]
        if (token0.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token0.position.line, 0)
        assert.equal(token0.position.column, 0)
        assert.equal(token0.value, -234)
        const token1 = result[1]
        assert.equal(token1.kind, ",")
        assert.equal(token1.position.line, 0)
        assert.equal(token1.position.column, 4)
        const token2 = result[2]
        if (token2.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token2.position.line, 0)
        assert.equal(token2.position.column, 5)
        assert.equal(token2.value, 56.78)
        assert.equal(errors.length, 0)
    })
    it("null and string", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("null\"-234\"", e => errors.push(e)))
        assert.equal(result.length, 2)
        const token0 = result[0]
        if (token0.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token0.position.line, 0)
        assert.equal(token0.position.column, 0)
        assert.isNull(token0.value)
        const token1 = result[1]
        if (token1.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token1.position.line, 0)
        assert.equal(token1.position.column, 4)
        assert.equal(token1.value, "-234")
        assert.equal(errors.length, 0)
    })
    it("invalid number", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("-+123e+56", e => errors.push(e)))

        assert.equal(result.length, 1)

        const token0 = result[0]
        if (token0.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token0.position.line, 0)
        assert.equal(token0.position.column, 0)
        assert.equal(token0.value, "-+123e+56")

        assert.equal(errors.length, 1)
    })
    it("control character", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("\"\n\"", e => errors.push(e)))

        assert.equal(result.length, 1)

        const token0 = result[0]
        if (token0.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token0.position.line, 0)
        assert.equal(token0.position.column, 0)
        assert.equal(token0.value, "\n")

        assert.equal(errors.length, 1)
    })
    it("invalid escape", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("\"\\a\"", e => errors.push(e)))

        assert.equal(result.length, 1)

        const token0 = result[0]
        if (token0.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token0.position.line, 0)
        assert.equal(token0.position.column, 0)
        assert.equal(token0.value, "a")

        assert.equal(errors.length, 1)
    })
    it("end of file", () => {
        const errors: ParseError[] = []
        const result = toArray(tokenize("\"xyz", e => errors.push(e)))

        assert.equal(result.length, 1)

        const token0 = result[0]
        if (token0.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token0.position.line, 0)
        assert.equal(token0.position.column, 0)
        assert.equal(token0.value, "xyz")

        assert.equal(errors.length, 1)
    })
    it("invalid symbol", () => {
        const errors: ParseError[] = []
        toArray(tokenize("*", e => errors.push(e)))
        assert.equal(errors.length, 1)
    })
})
