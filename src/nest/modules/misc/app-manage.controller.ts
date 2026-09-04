import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query
} from '@nestjs/common'
import { AppManageService } from './app-manage.service'

@Controller('appApi')
export class AppManageController {
  constructor(private readonly appManageService: AppManageService) {}

  @Get('list')
  list(@Query() query: Record<string, string>) {
    return this.appManageService.list(query)
  }

  @Get('detail/:id')
  detail(@Param('id') id: string) {
    return this.appManageService.detail(Number(id))
  }

  @Post('create')
  create(@Body() body: Record<string, unknown>) {
    return this.appManageService.create(body as never)
  }

  @Put('update')
  update(@Body() body: Record<string, unknown>) {
    return this.appManageService.update(body as never)
  }

  @Delete('delete/:id')
  remove(@Param('id') id: string) {
    return this.appManageService.remove(Number(id))
  }

  @Delete('batchDelete')
  batchDelete(
    @Body() body: Array<number | string> | { ids?: Array<number | string> }
  ) {
    const ids = Array.isArray(body) ? body : body?.ids || []
    return this.appManageService.batchDelete(ids)
  }

  @Post('upgrade/:id')
  upgrade(
    @Param('id') id: string,
    @Body() body: { file_path?: string; filePath?: string; id?: number }
  ) {
    return this.appManageService.upgrade(
      Number(id || body.id),
      body.file_path ?? body.filePath
    )
  }

  @Post('publish/:id')
  publish(@Param('id') id: string) {
    return this.appManageService.publish(Number(id))
  }

  @Get('versions/:id')
  versions(@Param('id') id: string) {
    return this.appManageService.versions(Number(id))
  }

  @Post('offline/:id')
  offline(@Param('id') id: string) {
    return this.appManageService.offline(Number(id))
  }
}
