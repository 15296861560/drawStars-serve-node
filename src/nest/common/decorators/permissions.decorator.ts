import { SetMetadata } from '@nestjs/common'

export const PERMISSIONS_KEY = 'permissions'

/** Require any of the listed permission codes */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)
