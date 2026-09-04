import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql'
import { Public } from '../../../common/decorators/public.decorator'
import { GenericMutationResult, UserProfileType } from './user-profile.type'
import { UsersService } from '../users.service'

@Resolver(() => UserProfileType)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Public()
  @Query(() => UserProfileType, { nullable: true })
  async userProfile(@Args('id', { type: () => Int }) id: number) {
    const data = await this.usersService.queryUserInfo(id)
    if (!data) return null
    return {
      id: Number(data.id),
      name: data.name ?? undefined,
      introduction: data.introduction ?? undefined,
      birthday: data.birthday ?? undefined,
      region: data.region ?? undefined,
      gender: data.gender ?? undefined,
      phone: data.phone ?? undefined
    }
  }

  @Mutation(() => GenericMutationResult)
  async changeUserPhone(
    @Args('id', { type: () => Int }) id: number,
    @Args('phone', { type: () => String }) phone: string
  ) {
    await this.usersService.updateUserInfo(id, { phone })
    return { status: true, msg: 'ok' }
  }
}
