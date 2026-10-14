import 'reflect-metadata'
import './env'
import './public/utils/axios/axios-config'
import './public/ws/wsServer'
import './public/ws/notifyServer'
import './config/redis-config'

import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './nest/app.module'
import config from './config/publish-config'
import { initAccessTokenService } from './lib/access-token-service'
import { AllExceptionsFilter } from './nest/common/filters/all-exceptions.filter'
import { bindPartyWsGateway } from './public/ws/party-ws-bridge'
import { PartyGameService } from './nest/modules/party/games/party.game.service'

async function bootstrap() {
  await initAccessTokenService()

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: true
  })

  // REST viewerKey 与 WS 侧同源：信任 XFF 首跳，使 request.ip 不再折叠为 127.0.0.1
  // （party.util resolveClientKey 依赖 request.ip；未开 trust proxy 时所有 REST 客户端共享同一 identity）
  app.getHttpAdapter().getInstance().set('trust proxy', true)

  // party WS 网关绑定：Nest 容器就绪后接入 wsServer 静态插槽（party 编排链激活）
  bindPartyWsGateway(app.get(PartyGameService))

  app.use((req, _res, next) => {
    if (req.url === '/api') {
      req.url = '/'
    } else if (req.url.startsWith('/api/')) {
      req.url = req.url.slice(4)
    }
    next()
  })

  app.enableCors({
    origin: '*',
    methods: 'PUT,POST,GET,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type,Content-Length, Authorization, Accept, X-Requested-With, accessToken, accesstoken'
  })
  app.useStaticAssets('uploadDir')

  app.useGlobalFilters(new AllExceptionsFilter())

  await app.listen(config.serve_port)
  console.log(`nest server run port ${config.serve_port}`)
}

bootstrap().catch(error => {
  console.error('failed to bootstrap nest app:', error)
  process.exit(1)
})
