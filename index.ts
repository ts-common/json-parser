import {
    JsonPrimitive, Json, JsonObject, MutableJsonArray, MutableJsonRef, MutableJsonObject
} from "@ts-common/json"
import { iterable } from "@ts-common/iterator"
import { StringMap } from "@ts-common/string-map"
import { FilePosition, Tracked, addInfo, FileInfo } from "@ts-common/source-map"

namespace fa {
    export interface Result<C, R> {
        readonly result: ReadonlyArray<R>
        readonly state: State<C, R>
    }
    export type State<C, R> = (c: IteratorResult<C>) => Result<C, R>
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

export interface ErrorBase {
    readonly position: FilePosition
    readonly token: string
}

export type SyntaxErrorMessage =
    "invalid token"|
    "invalid symbol"|
    "invalid escape symbol"|
    "unexpected end of file"

export interface SyntaxError extends ErrorBase {
    readonly kind: "syntax"
    readonly message: SyntaxErrorMessage
}

export type StructureErrorMessage =
    "unexpected token"|
    "expecting property name"

export interface StructureError extends ErrorBase {
    readonly kind: "structure"
    readonly message: StructureErrorMessage
}

export type ParseError = SyntaxError|StructureError

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

export type ReportError = (error: ParseError) => void

export function *tokenize2(s: string, reportError: ReportError): Iterator<JsonToken> {

    const report = (position: FilePosition, token: string, message: SyntaxErrorMessage) =>
        reportError({ kind: "syntax", position, token, message })

    const i = s[Symbol.iterator]()

    let line = 0
    let column = 0

    const position = (): FilePosition => ({ line, column })

    let n = i.next()

    const next = () => {
        if (!n.done) {
            if (n.value === "\n") {
                ++line
                column = 0
            } else {
                ++column
            }
            n = i.next()
        }
    }

    while (n.done) {
        const c = n.value
        if (symbol.is(c)) {
            yield { position: position(), kind: c }
        } else if (c === "\"") {
            let value = ""
            while (true) {
                next()
                if (n.done) {
                    report(position(), value, "unexpected end of file")
                    return
                }
                const cs = n.value
                if (cs === "\"") {
                    break
                }
            }
        }
        next()
    }
}

export const tokenize = (s: string, reportError: ReportError): Iterable<JsonToken> => {
    function *iterator(): Iterator<JsonToken> {
        const report = (position: FilePosition, token: string, message: SyntaxErrorMessage) =>
            reportError({ kind: "syntax", position, token, message })
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
            if (isNaN(number)) {
                report(bufferPosition, buffer,"invalid token")
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
                    } else {
                        if (isControl(c)) {
                            report(position(), c, "invalid symbol")
                        }
                        buffer += c
                    }
                    break
                case State.StringEscape:
                    const e = escapeMap[c]
                    if (e === undefined) {
                        report(position(), c, "invalid escape symbol")
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
                report(bufferPosition, buffer, "unexpected end of file")
                yield { position: bufferPosition, kind: "value", value: buffer }
                break
        }
    }
    return iterable(iterator)
}

export const parse = (fileInfo: FileInfo, context: string, reportError: ReportError): Json => {
    interface ObjectState {
        readonly kind: "object",
        readonly value: Tracked<JsonObject>
        propertyName?: string
    }
    interface ArrayState {
        readonly kind: "array",
        readonly value: MutableJsonArray
    }
    type State = undefined|ObjectState|ArrayState
    let state: State = undefined
    const createValue = <T extends MutableJsonRef>(token: JsonToken) => addInfo(
        {} as T,
        {
            kind: "object",
            position: token.position,
            parent: fileInfo,
            property: 0
        }
    )
    const report = (token: JsonToken, message: StructureErrorMessage) => reportError({
        kind: "structure",
        position: token.position,
        token: token.kind,
        message
    })
    const unexpectedToken = (token: JsonToken) => report(token, "unexpected token")
    for (const token of tokenize(context, reportError)) {
        if (state === undefined) {
            switch (token.kind) {
                case "value":
                    return token.value
                case "{":
                    state = {
                        kind: "object",
                        value: createValue<MutableJsonObject>(token)
                    }
                    break
                case "[":
                    state = {
                        kind: "array",
                        value: createValue<MutableJsonArray>(token)
                    }
                    break
                default:
                    unexpectedToken(token)
                    break
            }
        } else {
            if (state.kind === "object") {
                if (state.propertyName === undefined) {
                    switch (token.kind) {
                        case "}":
                            return state.value
                        case "value":
                            if (typeof state.value !== "string") {
                                report(token, "expecting property name")
                            }
                            state.propertyName = state.value.toString()
                            break
                        default:
                            unexpectedToken(token)
                            break
                    }
                }
            } else {
                switch (token.kind) {
                    case "]":
                        return state.value
                    case "value":
                        state.value.push(token.value)
                        break
                    default:
                        unexpectedToken(token)
                        break
                }
            }
        }
    }
    return null
}