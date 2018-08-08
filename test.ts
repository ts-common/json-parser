import "mocha"
import { assert } from "chai"
import { tokenize } from "./index"
import { toArray } from "@ts-common/iterator"

describe("tokenize", () => {
    it("empty", () => {
        const result = toArray(tokenize("", () => {})) as any[]
        assert.sameMembers(result, [])
    })
    it("spaces", () => {
        const result = toArray(tokenize("   \t\n   ", () => {})) as any[]
        assert.sameMembers(result, [])
    })
    it("string", () => {
        const result = toArray(tokenize(" \"xxx\"   ", () => {}))
        assert.equal(result.length, 1)
        const token = result[0]
        if (token.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token.value, "xxx")
        assert.equal(token.position.line, 0)
        assert.equal(token.position.column, 1)
    })
    it("stringEscape", () => {
        const result = toArray(tokenize(" \n  \"xx\\\"x\"   ", () => {}))
        assert.equal(result.length, 1)
        const token = result[0]
        if (token.kind !== "value") {
            return assert.fail()
        }
        assert.equal(token.value, "xx\"x")
        assert.equal(token.position.line, 1)
        assert.equal(token.position.column, 2)
    })
    it("symbol", () => {
        const result = toArray(tokenize(" \r\n\t  {   ", () => {}))
        assert.equal(result.length, 1)
        const token = result[0]
        assert.equal(token.kind, "{")
        assert.equal(token.position.line, 1)
        assert.equal(token.position.column, 3)
    })
    it("true and false", () => {
        const result = toArray(tokenize(" \r\n\n\t   true  false ", () => {}))
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
    })
    it("symbol and number", () => {
        const result = toArray(tokenize("-234,56.78", () => {}))
        console.log(result)
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
    })
})