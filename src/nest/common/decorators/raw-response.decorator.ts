import { SetMetadata } from "@nestjs/common";

export const RAW_RESPONSE_KEY = "rawResponse";

/** 跳过全局 ResponseInterceptor 包装（SSE、文件流等） */
export const RawResponse = () => SetMetadata(RAW_RESPONSE_KEY, true);
