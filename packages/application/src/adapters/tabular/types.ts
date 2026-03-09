export type TabularRow = Record<string, string>

export type TabularParseResult = {
  headers: string[]
  rows: TabularRow[]
  rawHeaderNames: string[]
}

export type TabularSerializeOptions = {
  headers: string[]
  rows: TabularRow[]
  sheetName?: string
}
