import { JsonPrimitive } from "@ts-common/json"
import { iterable } from "@ts-common/iterator"
import { StringMap } from '@ts-common/string-map';

export interface FilePosition {
    readonly line: number
    readonly column: number
}

namespace symbol {
    export type Type = "{"|"}"|"["|"]"|","|":"
    const set = new Set(["{", "}", "[", "]", ",", ":"])
    export const is = (c: string): c is Type => set.has(c)
}

namespace whiteSpace {
    export type Type = " "|"\t"|"\r"|"\n"
    const set = new Set([" ", "\t", "\r", "\n"])
    export const is = (c: string): c is Type => set.has(c)
}

interface JsonTokenBase {
    readonly position: FilePosition
}

interface JsonSymbolToken extends JsonTokenBase {
    readonly kind: symbol.Type
}

interface JsonValueToken extends JsonTokenBase {
    readonly kind: "value"
    readonly value: JsonPrimitive
}

type JsonToken = JsonSymbolToken|JsonValueToken

interface TokenError {
    readonly position: FilePosition
    readonly value: string
}

const isControl = (c: string): boolean => {
    const code = c.charCodeAt(0)
    return code <= 0x1F || code === 0x7F
}

type EscapeMap = StringMap<string|undefined>

const escapeMap: EscapeMap = {
    "\"": "\"",
    "\\": "\\",
    "\/": "/",
    "b": "\b",
    "t": "\t",
    "f": "\f",
    "r": "\r",
    "n": "\n",
}

export const tokenize = (s: string, _: (error: TokenError) => void): Iterable<JsonToken> => {
    function *iterator(): Iterator<JsonToken> {
        const enum State { WhiteSpace, String, StringEscape }
        let line = 0
        let column = 0
        const position = (): FilePosition => ({ line, column })
        let state: State = State.WhiteSpace
        let bufferPosition = position()
        let buffer = ""
        const createValueToken = (value: JsonPrimitive): [JsonValueToken] => {
            const result: [JsonValueToken] = [{ position: bufferPosition, kind: "value", value }]
            buffer = ""
            return result
        }
        const valueToken = (): JsonValueToken[] => {
            switch (buffer) {
                case "": return []
                case "true": return createValueToken(true)
                case "false": return createValueToken(false)
                case "null": return createValueToken(null)
            }
            const number = parseFloat(buffer)
            if (number === NaN) {
                // report an error
                return createValueToken(buffer)
            }
            return createValueToken(number)
        }
        for (const c of s) {
            switch (state) {
                case State.WhiteSpace:
                    if (symbol.is(c)) {
                        yield *valueToken()
                        yield { position: position(), kind: c }
                    } else if (c === "\"") {
                        yield *valueToken()
                        bufferPosition = position()
                        state = State.String
                    } else if (whiteSpace.is(c)) {
                        yield *valueToken()
                    } else {
                        if (buffer === "") {
                            bufferPosition = position()
                        }
                        buffer += c
                    }
                    break
                case State.String:
                    if (c === "\"") {
                        yield { position: bufferPosition, kind: "value", value: buffer }
                        buffer = ""
                        state = State.WhiteSpace
                    } else if (c === "\\") {
                        state = State.StringEscape
                    } else if (isControl(c)) {
                        // TODO: report an error
                    } else {
                        buffer += c
                    }
                    break
                case State.StringEscape:
                    const e = escapeMap[c]
                    if (e === undefined) {
                        // TODO: report an error
                        buffer += c
                    } else {
                        buffer += e
                    }
                    state = State.String
                    break
            }
            if (c === "\n") {
                ++line
                column = 0
            } else {
                ++column
            }
        }
        switch (state) {
            case State.WhiteSpace:
                yield *valueToken()
                break
            case State.String:
            case State.StringEscape:
                // report error
                yield { position: bufferPosition, kind: "value", value: buffer }
                break
        }
    }
    return iterable(iterator)
}
