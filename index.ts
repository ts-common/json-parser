import {
    JsonPrimitive, Json, JsonObject, MutableJsonArray, MutableJsonRef, MutableJsonObject
} from "@ts-common/json"
import { iterable, map } from "@ts-common/iterator"
import { FilePosition, Tracked, addInfo, FileInfo } from "@ts-common/source-map"
import { StringMap } from "@ts-common/string-map"

namespace fa {
    export interface Result<C, R> {
        readonly result?: ReadonlyArray<R>
        readonly state?: State<C, R>
    }
    export interface State<C, R> {
        readonly next: (c: C) => Result<C, R>|void
        readonly done?: () => R|void
    }
    export function applyState<C, R>(input: Iterable<C>, state: State<C, R>): Iterable<R> {
        function *iterator() {
            for (const c of input) {
                const result = state.next(c)
                if (result !== undefined) {
                    if (result.result !== undefined) {
                        yield *result.result
                    }
                    if (result.state !== undefined) {
                        state = result.state
                    }
                }
            }
            if (state.done !== undefined) {
                const r = state.done()
                if (r !== undefined) {
                    yield r
                }
            }
        }
        return iterable(iterator)
    }
    export function nextState<C, R>(
        result: ReadonlyArray<R>, state: State<C, R>, c: C
    ): Result<C, R> {
        const rs = state.next(c)
        if (rs === undefined) {
            return { result, state }
        }
        return {
            result: rs.result === undefined ? result : [...result, ...rs.result],
            state: rs.state === undefined ? state : rs.state
        }
    }
}

interface CharAndPosition {
    readonly c: string
    readonly line: number
    readonly column: number
}

export function addPosition(s: string): Iterable<CharAndPosition> {
    let line = 0
    let column = 0
    return map(s, c => {
        const result = { c, line, column }
        if (c === "\n") {
            ++line
            column = 0
        } else {
            ++column
        }
        return result
    })
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

namespace jsonValue {
    export type Type =
        "a"|"b"|"c"|"d"|"e"|"f"|"g"|"h"|"i"|"j"|
        "k"|"l"|"m"|"n"|"o"|"p"|"q"|"r"|"s"|"t"|
        "u"|"v"|"w"|"x"|"y"|"z"|
        "A"|"B"|"C"|"D"|"E"|"F"|"G"|"H"|"I"|"J"|
        "K"|"L"|"M"|"N"|"O"|"P"|"Q"|"R"|"S"|"T"|
        "U"|"V"|"W"|"X"|"Y"|"Z"|
        "_"|"+"|"-"|"."|
        "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"8"
    const set = new Set([
        "a","b","c","d","e","f","g","h","i","j",
        "k","l","m","n","o","p","q","r","s","t",
        "u","v","w","x","y","z",
        "A","B","C","D","E","F","G","H","I","J",
        "K","L","M","N","O","P","Q","R","S","T",
        "U","V","W","X","Y","Z",
        "_","+","-",".",
        "0","1","2","3","4","5","6","7","8","8"
    ])
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
    "unexpected end of string"

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

export const tokenize = (s: string, reportError: ReportError): Iterable<JsonToken> => {

    type State = fa.State<CharAndPosition, JsonToken>

    const report = (position: FilePosition, token: string, message: SyntaxErrorMessage) =>
        reportError({ kind: "syntax", position, token, message })

    const whiteSpaceState: State ={
        next: cp => {
            if (cp.c === "\"") {
                return { state: stringState(cp) }
            }
            if (symbol.is(cp.c)) {
                return { result: [{ kind: cp.c, position: cp }] }
            }
            if (jsonValue.is(cp.c)) {
                return { state: jsonValueState(cp) }
            }
            if (!whiteSpace.is(cp.c)) {
                report(cp, cp.c, "invalid symbol")
            }
            return
        }
    }


    function stringState(position: FilePosition): State {
        let value = ""

        const getResult = (): JsonToken => ({ kind: "value", value, position })

        const done = () => {
            report(position, value, "unexpected end of string")
            return getResult()
        }

        const state: State = {
            next: cp => {
                if (cp.c === "\"") {
                    return {
                        result: [getResult()],
                        state: whiteSpaceState
                    }
                }
                if (isControl(cp.c)) {
                    report(cp, cp.c, "invalid symbol")
                }
                if (cp.c === "\\") {
                    return { state: escapeState }
                }
                value += cp.c
                return
            },
            done
        }

        const escapeState: State = {
            next: cp => {
                const e = escapeMap[cp.c]
                if (e === undefined) {
                    report(cp, cp.c, "invalid escape symbol")
                    value += cp.c
                } else {
                    value += e
                }
                return { state }
            },
            done
        }

        return state
    }

    function jsonValueState(prior: CharAndPosition): State {
        let value = prior.c

        const getResultValue = () => {
            switch (value) {
                case "true": return true
                case "false": return false
                case "null": return null
            }
            const number = parseFloat(value)
            if (isNaN(number)) {
                report(prior, value, "invalid token")
                return value
            }
            return number
        }

        const done = (): JsonToken => ({
            kind: "value",
            value: getResultValue(),
            position: prior
        })

        return {
            next: cp => {
                if (jsonValue.is(cp.c)) {
                    value += cp.c
                    return
                }
                return fa.nextState([done()], whiteSpaceState, cp)
            },
            done
        }
    }

    return fa.applyState(addPosition(s), whiteSpaceState)
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