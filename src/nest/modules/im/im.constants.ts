/**
 * IM 模块常量：枚举、错误码、WS 事件名、默认配置
 * 对齐 prd/聊天体系_PRD_v1.0.md
 */

// 会话类型
export enum ConvType {
  C2C = 'C2C',
  GROUP = 'GROUP',
  ROOM = 'ROOM'
}

// 消息类型
export enum MsgType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  VIDEO = 'VIDEO',
  FILE = 'FILE',
  CUSTOM = 'CUSTOM',
  TIP = 'TIP'
}

// 消息状态
export enum MsgStatus {
  NORMAL = 'NORMAL',
  RECALLED = 'RECALLED',
  DELETED = 'DELETED'
}

// 成员角色
export enum MemberRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER'
}

// 房间/群加入模式
export enum JoinMode {
  FREE = 'FREE',
  APPROVE = 'APPROVE',
  INVITE = 'INVITE'
}

// 房间发言模式
export enum SpeakMode {
  ALL = 'ALL',
  ADMIN_ONLY = 'ADMIN_ONLY',
  MUTE_ALL = 'MUTE_ALL'
}

// 房间状态
export enum RoomStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
  BANNED = 'BANNED'
}

// 群类型
export enum GroupType {
  PRIVATE = 'PRIVATE',
  PUBLIC = 'PUBLIC'
}

// 好友状态
export enum FriendStatus {
  NONE = 'NONE',
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED'
}

// 举报状态
export enum ReportStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  REJECTED = 'REJECTED',
  ESCALATED = 'ESCALATED'
}

// 申请加入状态
export enum JoinStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED'
}

// 用户呈现状态
export enum PresenceStatus {
  ONLINE = 'ONLINE',
  BUSY = 'BUSY',
  INVISIBLE = 'INVISIBLE',
  OFFLINE = 'OFFLINE'
}

// 目标类型（举报/申请）
export enum TargetType {
  USER = 'USER',
  GROUP = 'GROUP',
  ROOM = 'ROOM',
  MESSAGE = 'MESSAGE'
}

// ============ 错误码（PRD §4.13）============
export enum ImErrorCode {
  AUTH_EXPIRED = 'IM_AUTH_EXPIRED',
  NOT_CONNECTED = 'IM_NOT_CONNECTED',
  FREQ_LIMIT = 'IM_FREQ_LIMIT',
  SENSITIVE = 'IM_SENSITIVE',
  MUTED = 'IM_MUTED',
  BLOCKED = 'IM_BLOCKED',
  STRANGER_DENIED = 'IM_STRANGER_DENIED',
  STRANGER_LIMIT = 'IM_STRANGER_LIMIT',
  ROOM_FULL = 'IM_ROOM_FULL',
  ROOM_CLOSED = 'IM_ROOM_CLOSED',
  NO_PERMISSION = 'IM_NO_PERMISSION',
  RECALL_TIMEOUT = 'IM_RECALL_TIMEOUT',
  MSG_DUPLICATE = 'IM_MSG_DUPLICATE',
  UPLOAD_INVALID = 'IM_UPLOAD_INVALID',
  WS_DOWN = 'IM_WS_DOWN',
  FORWARD_DENIED = 'IM_FORWARD_DENIED',
  CREATE_LIMIT = 'IM_CREATE_LIMIT',
  JOIN_PENDING = 'IM_JOIN_PENDING',
  JOIN_DENIED = 'IM_JOIN_DENIED'
}

export interface ImErrorMeta {
  code: ImErrorCode
  httpStatus: number
  message: string
}

export const IM_ERROR_MAP: Record<ImErrorCode, ImErrorMeta> = {
  [ImErrorCode.AUTH_EXPIRED]: {
    code: ImErrorCode.AUTH_EXPIRED,
    httpStatus: 401,
    message: '登录已过期，请重新进入聊天'
  },
  [ImErrorCode.NOT_CONNECTED]: {
    code: ImErrorCode.NOT_CONNECTED,
    httpStatus: 409,
    message: '连接中，请稍后重试'
  },
  [ImErrorCode.FREQ_LIMIT]: {
    code: ImErrorCode.FREQ_LIMIT,
    httpStatus: 429,
    message: '发送太频繁，请稍后再试'
  },
  [ImErrorCode.SENSITIVE]: {
    code: ImErrorCode.SENSITIVE,
    httpStatus: 400,
    message: '消息包含敏感内容'
  },
  [ImErrorCode.MUTED]: {
    code: ImErrorCode.MUTED,
    httpStatus: 403,
    message: '你已被禁言'
  },
  [ImErrorCode.BLOCKED]: {
    code: ImErrorCode.BLOCKED,
    httpStatus: 403,
    message: '无法发送消息'
  },
  [ImErrorCode.STRANGER_DENIED]: {
    code: ImErrorCode.STRANGER_DENIED,
    httpStatus: 403,
    message: '对方不接受陌生人消息'
  },
  [ImErrorCode.STRANGER_LIMIT]: {
    code: ImErrorCode.STRANGER_LIMIT,
    httpStatus: 429,
    message: '今日陌生人私信次数已达上限'
  },
  [ImErrorCode.ROOM_FULL]: {
    code: ImErrorCode.ROOM_FULL,
    httpStatus: 403,
    message: '房间已满'
  },
  [ImErrorCode.ROOM_CLOSED]: {
    code: ImErrorCode.ROOM_CLOSED,
    httpStatus: 403,
    message: '房间不可进入'
  },
  [ImErrorCode.NO_PERMISSION]: {
    code: ImErrorCode.NO_PERMISSION,
    httpStatus: 403,
    message: '没有操作权限'
  },
  [ImErrorCode.RECALL_TIMEOUT]: {
    code: ImErrorCode.RECALL_TIMEOUT,
    httpStatus: 400,
    message: '已超过可撤回时间'
  },
  [ImErrorCode.MSG_DUPLICATE]: {
    code: ImErrorCode.MSG_DUPLICATE,
    httpStatus: 200,
    message: '消息已发送'
  },
  [ImErrorCode.UPLOAD_INVALID]: {
    code: ImErrorCode.UPLOAD_INVALID,
    httpStatus: 400,
    message: '文件不符合要求'
  },
  [ImErrorCode.WS_DOWN]: {
    code: ImErrorCode.WS_DOWN,
    httpStatus: 503,
    message: '实时服务维护中'
  },
  [ImErrorCode.FORWARD_DENIED]: {
    code: ImErrorCode.FORWARD_DENIED,
    httpStatus: 403,
    message: '该消息不允许转发'
  },
  [ImErrorCode.CREATE_LIMIT]: {
    code: ImErrorCode.CREATE_LIMIT,
    httpStatus: 429,
    message: '今日创建房间数已达上限'
  },
  [ImErrorCode.JOIN_PENDING]: {
    code: ImErrorCode.JOIN_PENDING,
    httpStatus: 409,
    message: '请等待审核'
  },
  [ImErrorCode.JOIN_DENIED]: {
    code: ImErrorCode.JOIN_DENIED,
    httpStatus: 403,
    message: '无法加入'
  }
}

// ============ WS 事件名（PRD §7.6）============
export enum WsEventType {
  // 上行
  AUTH = 'AUTH',
  SUBSCRIBE = 'SUBSCRIBE',
  UNSUBSCRIBE = 'UNSUBSCRIBE',
  SEND = 'SEND',
  READ = 'READ',
  PING = 'PING',
  ROOM_PRESENCE = 'ROOM_PRESENCE',
  // 下行
  MESSAGE = 'MESSAGE',
  RECALL = 'RECALL',
  READ_RECEIPT = 'READ',
  MEMBER_JOIN = 'MEMBER_JOIN',
  MEMBER_LEAVE = 'MEMBER_LEAVE',
  KICK = 'KICK',
  MUTE = 'MUTE',
  ROOM_UPDATE = 'ROOM_UPDATE',
  GROUP_UPDATE = 'GROUP_UPDATE',
  PROFILE_UPDATE = 'PROFILE_UPDATE',
  JOIN_REQUEST = 'JOIN_REQUEST',
  TAB_TAKEOVER = 'IM_TAB_TAKEOVER',
  WS_DEGRADED = 'WS_DEGRADED',
  ACK = 'ACK',
  PONG = 'PONG',
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  FRIEND_RESULT = 'FRIEND_RESULT'
}

// ============ 默认配置（PRD §4.11 / §4.8 / §4.6）============
export const IM_DEFAULTS = {
  accessTokenTtlSec: 2 * 60 * 60, // 2 小时
  accessTokenRefreshAheadSec: 5 * 60, // 提前 5 分钟
  wsTicketTtlSec: 2 * 60, // ≤ 2 分钟
  wsHeartbeatSec: 25, // Ping/Pong 25s
  wsHeartbeatTimeoutSec: 90, // 超时 90s
  roomPresenceSec: 30, // 房间停留心跳 30s
  roomPresenceMissLimit: 3, // 缺 3 次离房
  recallTimeoutSec: 2 * 60, // 撤回 2 分钟
  adminRecallTimeoutSec: 24 * 60 * 60, // 管理员撤回他人 24h
  freqPerSec: 5, // 单房间 ≤ 5 条/秒
  freqPerMin: 60, // ≤ 60 条/分钟
  strangerPerDayUsers: 5, // 陌生人私信 ≤ 5 人/日
  strangerPerDayMsgs: 10, // ≤ 10 条/日
  createRoomPerDay: 3, // 建房 ≤ 3/日
  joinRequestTtlSec: 7 * 24 * 60 * 60, // 申请 7 日过期
  joinRequestPendingPerDay: 1, // 同一目标 24h 内 1 条 PENDING
  friendRejectCooldownSec: 7 * 24 * 60 * 60, // 被拒 7 日内不可重复申请
  maxPinned: 20, // 置顶 ≤ 20
  maxFriends: 3000, // 好友上限
  c2cHistoryPageSize: 20,
  roomHistoryRetainDays: 7,
  groupHistoryRetainDays: 180,
  roomMaxMembers: 500,
  groupMaxMembers: 200,
  publicGroupMaxMembers: 2000,
  subscribeBatchLimit: 100,
  hallOnlineDelaySec: 15,
  imageMaxBytes: 10 * 1024 * 1024,
  imageMimes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
}

// Redis key 工具
export const imRedisKey = {
  wsTicket: (ticket: string) => `im:ws:ticket:${ticket}`,
  accessToken: (uid: string | number) => `im:token:${uid}`,
  userConn: (uid: string | number) => `im:presence:user:${uid}`, // value: nodeId:connId
  roomOnline: (roomId: string | number) => `im:presence:room:${roomId}:online`,
  freqUserConv: (uid: string | number, convId: string | number) =>
    `im:freq:${uid}:conv:${convId}`,
  strangerMsgUserDay: (uid: string | number, dayKey: string) =>
    `im:stranger:users:${uid}:${dayKey}`,
  strangerMsgCountDay: (uid: string | number, dayKey: string) =>
    `im:stranger:count:${uid}:${dayKey}`,
  createRoomDay: (uid: string | number, dayKey: string) =>
    `im:room:create:${uid}:${dayKey}`
}
