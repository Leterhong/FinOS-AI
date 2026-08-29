/** pdf-parse 无官方类型：声明最小接口（仅服务端解析 PDF 文本）。 */
declare module "pdf-parse" {
  function pdfParse(buffer: Buffer): Promise<{ text: string; numpages: number }>;
  export = pdfParse;
}
