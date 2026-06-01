import { Field, Int, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class UserProfileType {
  @Field(() => Int)
  id!: number;

  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  introduction?: string;

  @Field({ nullable: true })
  birthday?: string;

  @Field({ nullable: true })
  region?: string;

  @Field({ nullable: true })
  gender?: string;

  @Field({ nullable: true })
  phone?: string;
}

@ObjectType()
export class GenericMutationResult {
  @Field()
  status!: boolean;

  @Field()
  msg!: string;
}
