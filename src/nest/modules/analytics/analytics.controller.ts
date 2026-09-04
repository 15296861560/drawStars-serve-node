import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req
} from '@nestjs/common'
import type { Request } from 'express'
import { Public } from '../../common/decorators/public.decorator'
import { AnalyticsService } from './analytics.service'

@Controller('analyticsApi')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /** 页面访问采集（Umami collect 兼容简化版） */
  @Public()
  @Post('collect')
  async collect(
    @Body()
    body: {
      type?: string
      payload?: Record<string, string>
      website?: string
      hostname?: string
      screen?: string
      language?: string
      url?: string
      referrer?: string
      title?: string
    },
    @Req() req: Request
  ) {
    try {
      const payload = body.payload ? { type: body.type, ...body.payload } : body
      return await this.analyticsService.collect(payload, req)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('websites')
  async listWebsites() {
    try {
      return await this.analyticsService.listWebsites()
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('website/:id')
  async getWebsite(@Param('id') id: string) {
    try {
      return await this.analyticsService.getWebsite(id)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('website')
  async createWebsite(
    @Body() body: { name: string; domain?: string; websiteUuid?: string }
  ) {
    try {
      return await this.analyticsService.createWebsite(body)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Put('website/:id')
  async updateWebsite(
    @Param('id') id: string,
    @Body() body: { name?: string; domain?: string }
  ) {
    try {
      return await this.analyticsService.updateWebsite(Number(id), body)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Delete('website/:id')
  async deleteWebsite(@Param('id') id: string) {
    try {
      return await this.analyticsService.deleteWebsite(Number(id))
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Post('website/:id/reset')
  async resetWebsite(@Param('id') id: string) {
    try {
      return await this.analyticsService.resetWebsite(Number(id))
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('website/:id/pageviews')
  async pageviews(
    @Param('id') id: string,
    @Query() query: Record<string, string>
  ) {
    try {
      return await this.analyticsService.getPageviews(id, query)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('website/:id/metrics')
  async metrics(
    @Param('id') id: string,
    @Query() query: Record<string, string>
  ) {
    try {
      return await this.analyticsService.getMetrics(id, query)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('website/:id/stats')
  async stats(@Param('id') id: string, @Query() query: Record<string, string>) {
    try {
      return await this.analyticsService.getStats(id, query)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  @Get('website/:id/active')
  async active(@Param('id') id: string) {
    try {
      return await this.analyticsService.getActive(id)
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }

  /** 首页访问量 / 访问来源图表 */
  @Public()
  @Get('homeCharts')
  async homeCharts() {
    try {
      return await this.analyticsService.getHomeCharts()
    } catch (error) {
      return {
        status: false,
        msg: error instanceof Error ? error.message : String(error),
        data: null
      }
    }
  }
}
