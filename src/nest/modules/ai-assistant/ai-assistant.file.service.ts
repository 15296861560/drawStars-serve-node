import { Injectable, BadRequestException } from '@nestjs/common'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { AiAssistantConfigService } from './ai-assistant.config.service'

const TEXT_EXT = new Set([
  '.txt',
  '.md',
  '.json',
  '.csv',
  '.log',
  '.xml',
  '.html',
  '.htm',
  '.js',
  '.ts',
  '.vue',
  '.css',
  '.less',
  '.yaml',
  '.yml'
])

const MAX_EXCERPT = 12000

export interface ParsedUploadFile {
  fileId: string
  name: string
  mimeType: string
  size: number
  url: string
  excerpt: string
  storedPath: string
}

@Injectable()
export class AiAssistantFileService {
  private readonly uploadDir: string

  constructor(private readonly aiConfig: AiAssistantConfigService) {
    this.uploadDir = path.join(process.cwd(), 'uploadDir', 'ai-assistant')
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true })
    }
  }

  getUploadDir() {
    return this.uploadDir
  }

  async saveAndParse(
    tempPath: string,
    originalName: string,
    mimeType: string,
    size: number
  ): Promise<ParsedUploadFile> {
    const ext = path.extname(originalName).toLowerCase()
    const fileId = randomUUID()
    const safeName = `${Date.now()}_${fileId}${ext}`
    const storedPath = path.join(this.uploadDir, safeName)

    await fs.promises.rename(tempPath, storedPath)

    const excerpt = await this.extractText(storedPath, ext, mimeType)
    const url = `/ai-assistant/${safeName}`

    return {
      fileId,
      name: originalName,
      mimeType: mimeType || 'application/octet-stream',
      size,
      url,
      excerpt,
      storedPath
    }
  }

  private async extractText(
    filePath: string,
    ext: string,
    mimeType: string
  ): Promise<string> {
    try {
      if (TEXT_EXT.has(ext) || mimeType.startsWith('text/')) {
        const raw = await fs.promises.readFile(filePath, 'utf-8')
        return this.trimExcerpt(raw)
      }

      if (ext === '.pdf' || mimeType === 'application/pdf') {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse')
        const buffer = await fs.promises.readFile(filePath)
        const data = await pdfParse(buffer)
        return this.trimExcerpt(data.text || '')
      }

      if (
        ext === '.xlsx' ||
        ext === '.xls' ||
        mimeType.includes('spreadsheet')
      ) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const XLSX = require('xlsx')
        const workbook = XLSX.readFile(filePath)
        const lines: string[] = []
        for (const sheetName of workbook.SheetNames.slice(0, 3)) {
          const sheet = workbook.Sheets[sheetName]
          const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' })
          lines.push(`[${sheetName}]\n${csv}`)
        }
        return this.trimExcerpt(lines.join('\n\n'))
      }

      if (ext === '.docx' || mimeType.includes('wordprocessingml')) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mammoth = require('mammoth')
        const result = await mammoth.extractRawText({ path: filePath })
        return this.trimExcerpt(result.value || '')
      }
    } catch (error) {
      console.error('[ai-assistant] parse file error:', error)
      return '（文件解析失败，仅记录文件名与大小）'
    }

    return '（暂不支持该格式的正文解析，已保存文件）'
  }

  private trimExcerpt(text: string): string {
    const normalized = text.replace(/\r\n/g, '\n').trim()
    if (normalized.length <= MAX_EXCERPT) return normalized
    return `${normalized.slice(0, MAX_EXCERPT)}\n…（已截断）`
  }

  async assertFileSize(size: number) {
    const { maxFileMb } = await this.aiConfig.getLlmConfig()
    if (size > maxFileMb * 1024 * 1024) {
      throw new BadRequestException(`文件不能超过 ${maxFileMb}MB`)
    }
  }
}
