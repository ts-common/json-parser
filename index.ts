import {
    JsonPrimitive, Json, MutableJsonArray, MutableJsonObject, MutableJsonRef
} from "@ts-common/json"
import { iterable, map, toArray } from "@ts-common/iterator"
import { FilePosition, setInfo, Tracked, ObjectInfo } from "@ts-common/source-map"
import { StringMap, MutableStringMap } from "@ts-common/string-map"
import { isPrimitive } from 'util';

namespace fa {
    export interface Result<C, R> {
        readonly result?: ReadonlyArray<R>
        readonly state?: State<C, R>
    }
    export interface State<C, R> {
        readonly next?: (c: C) => Result<C, R>|void
        readonly done?: () => R|void
    }
    export const applyState = <C, R>(input: Iterable<C>, state: State<C, R>): Iterable<R> =>
        iterable(function *() {
            for (const c of input) {
                if (state.next === undefined) {
                    break
                }
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
        })
    export function nextState<C, R>(
        result: ReadonlyArray<R>, state: State<C, R>, c: C
    ): Result<C, R> {
        if (state.next === undefined) {
            return { result, state }
        }
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
    readonly position: FilePosition
}

export function addPosition(s: string): Iterable<CharAndPosition> {
    let line = 1
    let column = 1
    return map(s, c => {
        const result = { c, position: { line, column } }
        if (c === "\n") {
            ++line
            column = 1
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
        "0"|"1"|"2"|"3"|"4"|"5"|"6"|"7"|"8"|"9"
    const set = new Set([
        "a","b","c","d","e","f","g","h","i","j",
        "k","l","m","n","o","p","q","r","s","t",
        "u","v","w","x","y","z",
        "A","B","C","D","E","F","G","H","I","J",
        "K","L","M","N","O","P","Q","R","S","T",
        "U","V","W","X","Y","Z",
        "_","+","-",".",
        "0","1","2","3","4","5","6","7","8","9"
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
    "unexpected end of file"|
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

export const defaultErrorReport = (e: ParseError) => { throw e }

export type ReportError = (error: ParseError) => void

export const tokenize = (
    s: string,
    reportError: ReportError = defaultErrorReport
): Iterable<JsonToken> => {

    type State = fa.State<CharAndPosition, JsonToken>

    const report = (position: FilePosition, token: string, message: SyntaxErrorMessage) =>
        reportError({ kind: "syntax", position, token, message })

    const whiteSpaceState: State ={
        next: cp => {
            if (cp.c === "\"") {
                return { state: stringState(cp.position) }
            }
            if (symbol.is(cp.c)) {
                return { result: [{ kind: cp.c, position: cp.position }] }
            }
            if (jsonValue.is(cp.c)) {
                return { state: jsonValueState(cp) }
            }
            if (!whiteSpace.is(cp.c)) {
                report(cp.position, cp.c, "invalid symbol")
            }
            return
        }
    }


    const stringState = (position: FilePosition): State => {
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
                    report(cp.position, cp.c, "invalid symbol")
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
                    report(cp.position, cp.c, "invalid escape symbol")
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

    const jsonValueState = (prior: CharAndPosition): State => {
        let value = prior.c

        const getResultValue = () => {
            switch (value) {
                case "true": return true
                case "false": return false
                case "null": return null
            }
            const number = parseFloat(value)
            if (isNaN(number)) {
                report(prior.position, value, "invalid token")
                return value
            }
            return number
        }

        const done = (): JsonToken => ({
            kind: "value",
            value: getResultValue(),
            position: prior.position
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

export const parse = (
    url: string,
    context: string,
    reportError: ReportError = defaultErrorReport
): Json => {

    type State = fa.State<JsonToken, never>

    const report = (position: FilePosition, token: string, message: StructureErrorMessage) =>
        reportError({ kind: "structure", position, token, message })

    const reportToken = (token: JsonToken, message: StructureErrorMessage) =>
        report(
            token.position,
            token.kind === "value" ? JSON.stringify(token.value) : token.kind,
            message
        )

    const endState: State = {
        next: t => {
            reportToken(t, "unexpected token")
            return { state: {} }
        }
    }

    interface ObjectOrArrayState<T extends object> {
        readonly state: State
        readonly value: Tracked<T>
        readonly primitiveProperties: MutableStringMap<FilePosition>
    }

    const objectState = (os: ObjectOrArrayState<MutableJsonObject>): State => {

        const separatorState: State = {
            next: t => {
                switch (t.kind) {
                    case "}": return { state: os.state }
                    case ",": return { state: propertyState }
                }
                reportToken(t, "unexpected token")
                return
            }
        }

        const propertyValueState = (name: string): State => ({
            next: t => {
                if (t.kind === ":") {
                    return {
                        state: valueState(
                            separatorState,
                            (v, position, primitiveProperties) => {
                                os.value[name] = v
                                if (isPrimitive(v)) {
                                    os.primitiveProperties[name] = position
                                }
                                return {
                                    isChild: true,
                                    position,
                                    parent: os.value,
                                    property: name,
                                    primitiveProperties
                                }
                            }
                        )
                    }
                }
                reportToken(t, "unexpected token")
                return
            }
        })

        const propertyState: State = {
            next: t => {
                if (t.kind !== "value") {
                    reportToken(t, "unexpected token")
                    return
                }
                let name = t.value
                if (name === null) {
                    reportToken(t, "expecting property name")
                    name = "null"
                } else if (typeof name !== "string") {
                    reportToken(t, "expecting property name")
                    name = name.toString()
                }
                return { state: propertyValueState(name) }
            }
        }

        return {
            next: t => {
                if (t.kind === "}") {
                    return { state: os.state }
                }
                return propertyState.next === undefined ? undefined : propertyState.next(t)
            }
        }
    }

    const arrayState = (as: ObjectOrArrayState<MutableJsonArray>): State => {

        const separatorState: State = {
            next: t => {
                switch (t.kind) {
                    case "]": return { state: as.state }
                    case ",": return { state: itemState }
                }
                reportToken(t, "unexpected token")
                return
            }
        }

        const itemState = valueState(
            separatorState,
            (v, position, primitiveProperties) => {
                const property = as.value.push(v) - 1
                if (isPrimitive(v)) {
                    as.primitiveProperties[property] = position
                }
                return {
                    isChild: true,
                    parent: as.value,
                    position,
                    property,
                    primitiveProperties
                }
            }
        )

        return {
            next: t => {
                if (t.kind === "]") {
                    return { state: as.state }
                }
                return itemState.next !== undefined ? itemState.next(t) : undefined
            }
        }
    }

    const valueState = (
        state: State,
        set: (
            v: Json,
            position: FilePosition,
            primitiveProperties: StringMap<FilePosition>
        ) => ObjectInfo,
    ): State => ({
        next: t => {
            const updateRef = <T extends MutableJsonRef>(value: T): ObjectOrArrayState<T> => {
                const primitiveProperties: MutableStringMap<FilePosition> = {}
                const info = set(value, t.position, primitiveProperties)
                return { state, value: setInfo(value, info), primitiveProperties }
            }
            switch (t.kind) {
                case "value":
                    set(t.value, t.position, {})
                    return { state }
                case "{":
                    const objectRef = updateRef<MutableJsonObject>({})
                    return { state: objectState(objectRef) }
                case "[":
                    const arrayRef = updateRef<MutableJsonArray>([])
                    return { state: arrayState(arrayRef) }
            }
            reportToken(t, "unexpected token")
            return
        }
    })

    const tokens = tokenize(context, reportError)
    let value: Json|undefined
    toArray(fa.applyState(
        tokens,
        valueState(
            endState,
            (v, position, primitiveProperties) => {
                value = v
                return {
                    isChild: false,
                    position,
                    url,
                    primitiveProperties
                }
            }
        )
    ))
    if (value === undefined) {
        report({ line: 1, column: 1 }, "", "unexpected end of file")
        return null
    }
    return value
}
