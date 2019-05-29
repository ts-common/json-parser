# JSON Parser

[![Build Status](https://dev.azure.com/ts-common/ts-common/_apis/build/status/ts-common.json-parser)](https://dev.azure.com/ts-common/ts-common/_build/latest?definitionId=15)

JSON Parser with a source map.

## Next Design

```ts
type TrackedJsonCommon = {
  // ...position, directives, raw value, kind, etc...
}

type TrackedJsonObject = {
  kind: "object"
  readonly properties: StringMap<TrackedJson>
} & TrackedJsonCommon

type TrackedJsonArray = {
  kind: "array"
  readonly items: ReadonlyArray<TrackedJson>
} & TrackedJsonCommon

type TrackedJsonPrimitive = {
  kind: "string"|"number"|"null"|"boolean"
} & TrackedJsonCommon

type TrackedJson = TrackedJsonObject|TrackedJsonArray|TrackedJsonPrimitive
```
