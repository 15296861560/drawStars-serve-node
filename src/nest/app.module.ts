import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { GraphQLModule } from "@nestjs/graphql";
import { join } from "path";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { UsersModule } from "./modules/users/users.module";
import { MysqlModule } from "./modules/mysql/mysql.module";
import { MiscModule } from "./modules/misc/misc.module";
import { AiAssistantModule } from "./modules/ai-assistant/ai-assistant.module";
import { LogsModule } from "./modules/logs/logs.module";
import { AnalyticsModule } from "./modules/analytics/analytics.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { PointsModule } from "./modules/points/points.module";
import { AuthGuard } from "./common/guards/auth.guard";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), "schema.gql"),
      playground: true,
      path: "/graphql",
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    MysqlModule,
    MiscModule,
    AiAssistantModule,
    LogsModule,
    AnalyticsModule,
    RbacModule,
    PointsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
