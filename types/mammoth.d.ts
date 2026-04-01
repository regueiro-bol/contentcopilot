declare module 'mammoth' {
  interface ConversionResult {
    value: string
    messages: Array<{ type: string; message: string; error?: Error }>
  }

  interface Options {
    buffer?: Buffer
    path?: string
    arrayBuffer?: ArrayBuffer
  }

  function extractRawText(input: Options): Promise<ConversionResult>
  function convertToHtml(input: Options): Promise<ConversionResult>
  function convertToMarkdown(input: Options): Promise<ConversionResult>
}
