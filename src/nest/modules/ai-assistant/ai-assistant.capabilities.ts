import type { AiMessage, AiMessageType } from './ai-assistant.types'
import type { AiAssistantBaiduService } from './ai-assistant.baidu.service'

export interface CapabilityContext {
  baidu: AiAssistantBaiduService
  fileExcerpt?: string
}

export async function resolveCapability(
  userText: string,
  conversationId: string,
  userType: AiMessageType,
  ctx: CapabilityContext
): Promise<Omit<AiMessage, 'id' | 'createdAt'> | null> {
  const trimmed = userText.trim()

  if (/天气|气温|温度|下雨|forecast/i.test(trimmed)) {
    const city = ctx.baidu.extractCity(trimmed)
    const weather = await ctx.baidu.getWeather(city)
    if (weather) {
      return {
        conversationId,
        role: 'assistant',
        type: 'rich',
        content: weather.detailHtml,
        capabilityId: 'weather',
        payload: {
          city: weather.city,
          text: weather.text,
          temp: weather.temp,
          aqi: weather.aqi
        }
      }
    }
    return {
      conversationId,
      role: 'assistant',
      type: 'rich',
      content: `<p>未能获取 <strong>${city}</strong> 天气，请确认已在 app_info 配置 <code>baidu_map</code> 的 AK。</p>`,
      capabilityId: 'weather'
    }
  }

  if (/翻译|translate/i.test(trimmed)) {
    const raw = ctx.baidu.extractTranslateQuery(trimmed) || 'hello'
    const tr = await ctx.baidu.translate(raw, 'auto', 'zh')
    if (tr) {
      return {
        conversationId,
        role: 'assistant',
        type: 'text',
        content: `「${tr.src}」→ 「${tr.dst}」`,
        capabilityId: 'translate',
        payload: { src: tr.src, dst: tr.dst, from: tr.from, to: tr.to }
      }
    }
    return {
      conversationId,
      role: 'assistant',
      type: 'text',
      content: `「${raw}」翻译失败，请确认 app_info 中已配置 baidu_translate。`,
      capabilityId: 'translate'
    }
  }

  if (/图表|chart|趋势|折线|柱状/i.test(trimmed)) {
    return {
      conversationId,
      role: 'assistant',
      type: 'chart',
      content: '根据您的描述生成的趋势图：',
      capabilityId: 'chart',
      payload: {
        height: 200,
        option: {
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: ['一', '二', '三', '四', '五'] },
          yAxis: { type: 'value' },
          series: [{ type: 'line', smooth: true, data: [8, 15, 12, 22, 18] }]
        }
      }
    }
  }

  if (/表格|table|列表|数据表/i.test(trimmed)) {
    return {
      conversationId,
      role: 'assistant',
      type: 'table',
      content: '数据表格：',
      capabilityId: 'table',
      payload: {
        columns: [
          { prop: 'name', label: '项目' },
          { prop: 'value', label: '数值' },
          { prop: 'status', label: '状态' }
        ],
        rows: [
          { name: '任务 A', value: 92, status: '完成' },
          { name: '任务 B', value: 76, status: '进行中' },
          { name: '任务 C', value: 45, status: '待开始' }
        ]
      }
    }
  }

  if (/代码|code|vue|函数|组件/i.test(trimmed)) {
    return {
      conversationId,
      role: 'assistant',
      type: 'rich',
      content:
        '<p>示例代码：</p><pre><code>// composable\nexport function useCounter() {\n  const n = ref(0)\n  return { n, inc: () => n.value++ }\n}</code></pre>',
      capabilityId: 'code'
    }
  }

  return null
}

export function defaultCapabilityReply(
  userText: string,
  conversationId: string,
  hasLlm: boolean
): Omit<AiMessage, 'id' | 'createdAt'> {
  const trimmed = userText.trim()
  if (hasLlm) {
    return {
      conversationId,
      role: 'assistant',
      type: 'rich',
      content: `<p>${trimmed ? `关于「${trimmed}」：` : ''}</p><p>（模型未返回内容，请检查 API Key 或网络）</p>`,
      capabilityId: 'default'
    }
  }
  return {
    conversationId,
    role: 'assistant',
    type: 'rich',
    content: `<p>收到：「${trimmed || '…'}」</p><p>未在 <code>app_info</code> 配置 <code>openai</code>（<code>app_certificate</code> 为 API Key），当前为规则回复。可尝试：<code>天气</code>、<code>翻译 hello</code>、<code>图表</code>、<code>表格</code>、<code>代码</code>。</p>`,
    capabilityId: 'default'
  }
}
