import * as addPosition from "@ts-common/add-position";
import * as iterator from "@ts-common/iterator";
import * as json from "@ts-common/json";
import * as sourceMap from "@ts-common/source-map";
import * as stringMap from "@ts-common/string-map";

// tslint:disable-next-line: no-namespace
namespace fa {
  export interface Result<C, R> {
    readonly result?: readonly R[];
    readonly state?: State<C, R>;
  }
  export interface State<C, R> {
    readonly next?: (c: C) => Result<C, R> | void;
    readonly done?: () => R | void;
  }
  export const applyState = <C, R>(
    input: iterator.Iterable<C>,
    state: State<C, R>
  ): iterator.IterableEx<R> =>
    iterator.iterable(function*() {
      for (const c of input) {
        if (state.next === undefined) {
          break;
        }
        const result = state.next(c);
        if (result !== undefined) {
          if (result.result !== undefined) {
            yield* result.result;
          }
          if (result.state !== undefined) {
            state = result.state;
          }
        }
      }
      if (state.done !== undefined) {
        const r = state.done();
        if (r !== undefined) {
          yield r;
        }
      }
    });
  export const nextState = <C, R>(
    result: readonly R[],
    state: State<C, R>,
    c: C
  ): Result<C, R> => {
    if (state.next === undefined) {
      return { result, state };
    }
    const rs = state.next(c);
    if (rs === undefined) {
      return { result, state };
    }
    return {
      result: rs.result === undefined ? result : [...result, ...rs.result],
      state: rs.state === undefined ? state : rs.state
    };
  };
}

namespace setUtil {
  export const create = <T extends string>(v: readonly T[]) => new Set<T>(v);
  export const isElement = <T extends string>(set: Set<T>, c: string): c is T =>
    set.has(c as T);
  export type GetElementType<T extends Set<string>> = T extends Set<infer U>
    ? U
    : string;
}

const symbol = setUtil.create(["{", "}", "[", "]", ",", ":"]);
const whiteSpace = setUtil.create([" ", "\t", "\r", "\n"]);
const jsonValue = setUtil.create(
  // prettier-ignore
  [ "a", "b", "c", "d", "e", "f", "g", "h", "i", "j",
  "k", "l", "m", "n", "o", "p", "q", "r", "s", "t",
  "u", "v", "w", "x", "y", "z",
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J",
  "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T",
  "U", "V", "W", "X", "Y", "Z",
  "_", "+", "-", ".",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]
);

interface JsonTokenBase {
  readonly position: sourceMap.FilePosition;
}

interface JsonSymbolToken extends JsonTokenBase {
  readonly kind: setUtil.GetElementType<typeof symbol>;
}

interface JsonValueToken extends JsonTokenBase {
  readonly kind: "value";
  readonly value: json.JsonPrimitive;
}

type JsonToken = JsonSymbolToken | JsonValueToken;

export interface ErrorBase {
  readonly position: sourceMap.FilePosition;
  readonly token: string;
  readonly message: string;
  readonly url: string;
}

export type SyntaxErrorCode =
  | "invalid token"
  | "invalid symbol"
  | "invalid escape symbol"
  | "unexpected end of string";

export interface SyntaxError extends ErrorBase {
  readonly kind: "syntax";
  readonly code: SyntaxErrorCode;
}

export type StructureErrorCode =
  | "unexpected end of file"
  | "unexpected token"
  | "expecting property name";

export interface StructureError extends ErrorBase {
  readonly kind: "structure";
  readonly code: StructureErrorCode;
}

export type ParseError = SyntaxError | StructureError;

const isControl = (c: string): boolean => {
  const code = c.charCodeAt(0);
  return code <= 0x1f || code === 0x7f;
};

type EscapeMap = stringMap.StringMap<string>;

const escapeMap: EscapeMap = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  t: "\t",
  f: "\f",
  r: "\r",
  n: "\n"
};

type HexMap = stringMap.StringMap<number>;

const hexMap: HexMap = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  A: 0xa,
  a: 0xa,
  B: 0xb,
  b: 0xb,
  C: 0xc,
  c: 0xc,
  D: 0xd,
  d: 0xd,
  E: 0xe,
  e: 0xe,
  F: 0xf,
  f: 0xf
};

export const defaultErrorReport = (e: ParseError) => {
  throw e;
};

export type ReportError = (error: ParseError) => void;

export const tokenize = (
  s: string,
  reportError: ReportError = defaultErrorReport,
  url: string
): iterator.IterableEx<JsonToken> => {
  type State = fa.State<addPosition.CharAndPosition, JsonToken>;

  const report = (
    position: sourceMap.FilePosition,
    token: string,
    code: SyntaxErrorCode
  ) =>
    reportError({
      kind: "syntax",
      code,
      position,
      token,
      message: `${code}, token: ${token}, line: ${position.line}, column: ${position.column}`,
      url
    });

  const whiteSpaceState: State = {
    next: cp => {
      if (cp.c === '"') {
        return { state: stringState(cp.position) };
      }
      if (setUtil.isElement(symbol, cp.c)) {
        return { result: [{ kind: cp.c, position: cp.position }] };
      }
      if (setUtil.isElement(jsonValue, cp.c)) {
        return { state: jsonValueState(cp) };
      }
      if (!setUtil.isElement(whiteSpace, cp.c)) {
        report(cp.position, cp.c, "invalid symbol");
      }
      return;
    }
  };

  const stringState = (position: sourceMap.FilePosition): State => {
    let value = "";

    const getResult = (): JsonToken => ({ kind: "value", value, position });

    const done = () => {
      report(position, value, "unexpected end of string");
      return getResult();
    };

    const state: State = {
      next: cp => {
        if (cp.c === '"') {
          return {
            result: [getResult()],
            state: whiteSpaceState
          };
        }
        if (isControl(cp.c)) {
          report(cp.position, cp.c, "invalid symbol");
        }
        if (cp.c === "\\") {
          return { state: escapeState };
        }
        value += cp.c;
        return;
      },
      done
    };

    const escapeState: State = {
      next: cp => {
        if (cp.c === "u") {
          return { state: unicodeState() };
        }
        const e = escapeMap[cp.c];
        if (e === undefined) {
          report(cp.position, cp.c, "invalid escape symbol");
          value += cp.c;
        } else {
          value += e;
        }
        return { state };
      },
      done
    };

    // UNICODE escape sequence
    const unicodeState = (): State => {
      let i = 0;
      let u = 0;
      return {
        next: cp => {
          const h = hexMap[cp.c];
          if (h === undefined) {
            report(cp.position, cp.c, "invalid escape symbol");
            return { state };
          }
          // tslint:disable-next-line: no-bitwise
          u = (u << 4) | h;
          ++i;
          // always for symbols https://json.org/
          if (i < 4) {
            return;
          }
          value += String.fromCharCode(u);
          return { state };
        },
        done
      };
    };

    return state;
  };

  const jsonValueState = (prior: addPosition.CharAndPosition): State => {
    let value = prior.c;

    const getResultValue = () => {
      switch (value) {
        case "true":
          return true;
        case "false":
          return false;
        case "null":
          return null;
      }
      const num = parseFloat(value);
      if (isNaN(num)) {
        report(prior.position, value, "invalid token");
        return value;
      }
      return num;
    };

    const done = (): JsonToken => ({
      kind: "value",
      value: getResultValue(),
      position: prior.position
    });

    return {
      next: cp => {
        if (setUtil.isElement(jsonValue, cp.c)) {
          value += cp.c;
          return;
        }
        return fa.nextState([done()], whiteSpaceState, cp);
      },
      done
    };
  };

  return fa.applyState(addPosition.addPosition(s), whiteSpaceState);
};

export const parse = (
  url: string,
  context: string,
  reportError: ReportError = defaultErrorReport
): json.Json => {
  type State = fa.State<JsonToken, never>;

  const report = (
    position: sourceMap.FilePosition,
    token: string,
    code: StructureErrorCode
  ) =>
    reportError({
      kind: "structure",
      code,
      position,
      token,
      message: `${code}, token: ${token}, line: ${position.line}, column: ${position.column}`,
      url
    });

  const reportToken = (token: JsonToken, message: StructureErrorCode) =>
    report(
      token.position,
      token.kind === "value" ? JSON.stringify(token.value) : token.kind,
      message
    );

  const endState: State = {
    next: t => {
      reportToken(t, "unexpected token");
      return { state: {} };
    }
  };

  interface ObjectOrArrayState<T extends json.JsonRef> {
    readonly state: State;
    readonly value: sourceMap.Tracked<T>;
    readonly primitiveProperties: stringMap.MutableStringMap<
      sourceMap.FilePosition
    >;
  }

  const objectState = (
    os: ObjectOrArrayState<json.MutableJsonObject>,
    position: sourceMap.FilePosition
  ): State => {
    const separatorState: State = {
      next: t => {
        switch (t.kind) {
          case "}":
            return { state: os.state };
          case ",":
            return { state: propertyState };
        }
        reportToken(t, "unexpected token");
        return;
      },
      done: () => {
        reportToken(
          { kind: "}", position: position },
          "unexpected end of file"
        );
      }
    };

    const propertyValueState = (name: string): State => ({
      next: t => {
        if (t.kind === ":") {
          return {
            state: valueState(
              separatorState,
              (v, position, primitiveProperties) => {
                os.value[name] = v;
                if (json.isPrimitive(v)) {
                  os.primitiveProperties[name] = position;
                }
                return {
                  isChild: true,
                  position,
                  parent: os.value,
                  property: name,
                  primitiveProperties
                };
              }
            )
          };
        }
        reportToken(t, "unexpected token");
        return;
      }
    });

    const propertyState: State = {
      next: t => {
        if (t.kind !== "value") {
          reportToken(t, "unexpected token");
          return;
        }
        let name = t.value;
        if (name === null) {
          reportToken(t, "expecting property name");
          name = "null";
        } else if (typeof name !== "string") {
          reportToken(t, "expecting property name");
          name = name.toString();
        }
        return { state: propertyValueState(name) };
      }
    };

    return {
      next: t => {
        if (t.kind === "}") {
          return { state: os.state };
        }
        return propertyState.next === undefined
          ? undefined
          : propertyState.next(t);
      },
      done: () => {
        reportToken(
          { kind: "}", position: position },
          "unexpected end of file"
        );
      }
    };
  };

  const arrayState = (
    as: ObjectOrArrayState<json.MutableJsonArray>,
    position: sourceMap.FilePosition
  ): State => {
    const separatorState: State = {
      next: t => {
        switch (t.kind) {
          case "]":
            return { state: as.state };
          case ",":
            return { state: itemState };
        }
        reportToken(t, "unexpected token");
        return;
      },
      done: () => {
        reportToken(
          { kind: "]", position: position },
          "unexpected end of file"
        );
      }
    };

    const itemState = valueState(
      separatorState,
      (v, position, primitiveProperties) => {
        const property = as.value.push(v) - 1;
        if (json.isPrimitive(v)) {
          as.primitiveProperties[property] = position;
        }
        return {
          isChild: true,
          parent: as.value,
          position,
          property,
          primitiveProperties
        };
      }
    );

    return {
      next: t => {
        if (t.kind === "]") {
          return { state: as.state };
        }
        return itemState.next !== undefined ? itemState.next(t) : undefined;
      },
      done: () => {
        reportToken(
          { kind: "]", position: position },
          "unexpected end of file"
        );
      }
    };
  };

  const valueState = (
    state: State,
    setFunc: (
      v: json.Json,
      position: sourceMap.FilePosition,
      primitiveProperties: stringMap.StringMap<sourceMap.FilePosition>
    ) => sourceMap.ObjectInfo
  ): State => ({
    next: t => {
      const updateRef = <T extends json.MutableJsonRef>(
        // tslint:disable-next-line: no-shadowed-variable
        value: T
      ): ObjectOrArrayState<T> => {
        const primitiveProperties: stringMap.MutableStringMap<sourceMap.FilePosition> = {};
        const info = setFunc(value, t.position, primitiveProperties);
        return {
          state,
          value: sourceMap.setInfo(value, info),
          primitiveProperties
        };
      };
      switch (t.kind) {
        case "value":
          setFunc(t.value, t.position, {});
          return { state };
        case "{":
          const objectRef = updateRef<json.MutableJsonObject>({});
          return { state: objectState(objectRef, t.position) };
        case "[":
          const arrayRef = updateRef<json.MutableJsonArray>([]);
          return { state: arrayState(arrayRef, t.position) };
      }
      reportToken(t, "unexpected token");
      return;
    }
  });

  const tokens = tokenize(context, reportError, url);
  let value: json.Json | undefined;
  fa.applyState(
    tokens,
    valueState(endState, (v, position, primitiveProperties) => {
      value = v;
      return {
        isChild: false,
        position,
        url,
        primitiveProperties
      };
    })
  ).toArray();
  if (value === undefined) {
    report({ line: 1, column: 1 }, "", "unexpected end of file");
    return null;
  }
  return value;
};
