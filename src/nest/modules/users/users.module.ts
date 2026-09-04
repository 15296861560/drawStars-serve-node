import { Module } from '@nestjs/common'
import { ProfileController } from './profile.controller'
import { UsersService } from './users.service'
import { UsersResolver } from './graphql/users.resolver'

@Module({
  controllers: [ProfileController],
  providers: [UsersService, UsersResolver],
  exports: [UsersService]
})
export class UsersModule {}
