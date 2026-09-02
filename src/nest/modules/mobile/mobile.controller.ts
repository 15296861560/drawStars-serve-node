import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Public } from "../../common/decorators/public.decorator";
import { RequirePermissions } from "../../common/decorators/permissions.decorator";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { MobileService } from "./mobile.service";
import { MobileP1Service } from "./mobile-p1.service";

type AuthedReq = {
  auth?: { uid?: string };
  query?: Record<string, unknown>;
};

function uidOf(req: AuthedReq): number | undefined {
  const uid = req?.auth?.uid;
  if (!uid) return undefined;
  const n = Number(uid);
  return Number.isFinite(n) ? n : undefined;
}

@Controller("mobile")
export class MobileController {
  constructor(
    private readonly mobileService: MobileService,
    private readonly mobileP1: MobileP1Service,
  ) {}

  @Get("modules")
  list(@Query() query: Record<string, string>) {
    return this.mobileService.listModules({
      platform: query.platform,
      category: query.category,
      keyword: query.keyword,
    });
  }

  @Get("modules/:code")
  detail(@Param("code") code: string) {
    return this.mobileService.moduleDetail(decodeURIComponent(code));
  }

  @Post("modules/:code/download")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("mobile:module:install")
  download(
    @Param("code") code: string,
    @Body() body: { platform?: string },
    @Query() query: Record<string, string>,
    @Req() req: AuthedReq,
  ) {
    return this.mobileService.download(
      decodeURIComponent(code),
      body?.platform || query.platform,
      uidOf(req),
    );
  }

  @Get("modules/:code/checkUpdate")
  checkUpdate(
    @Param("code") code: string,
    @Query() query: Record<string, string>,
  ) {
    return this.mobileService.checkModuleUpdate(
      decodeURIComponent(code),
      query.version,
    );
  }

  @Get("modules/:code/openCheck")
  openCheck(
    @Param("code") code: string,
    @Query() query: Record<string, string>,
  ) {
    return this.mobileService.openCheck(
      decodeURIComponent(code),
      query.version,
      query.shellVersion,
    );
  }

  @Public()
  @Get("modules/:code/package")
  redeemPackage(
    @Param("code") code: string,
    @Query() query: Record<string, string>,
  ) {
    return this.mobileService.redeemPackage(
      decodeURIComponent(code),
      query.token,
    );
  }

  @Post("module/ticket")
  ticket(@Body() body: { moduleCode?: string; platform?: string }, @Req() req: AuthedReq) {
    return this.mobileService.requestTicket({
      userId: uidOf(req),
      moduleCode: String(body?.moduleCode || ""),
      platform: body?.platform,
    });
  }

  @Public()
  @Post("module/exchangeTicket")
  exchange(@Body() body: { ticket?: string }) {
    return this.mobileService.exchangeTicket(String(body?.ticket || ""));
  }

  @Public()
  @Get("shell/checkUpdate")
  shellCheck(@Query() query: Record<string, string>) {
    return this.mobileService.checkShellUpdate(query);
  }

  @Post("telemetry/report")
  telemetry(@Body() body: { events?: unknown[] }) {
    return this.mobileService.reportTelemetry(body?.events || []);
  }

  @Post("modules/installed/sync")
  syncInstalled(
    @Body()
    body: {
      list?: Array<{
        moduleCode: string;
        version?: string;
        platform?: string;
        mode?: string;
      }>;
    },
    @Req() req: AuthedReq,
  ) {
    return this.mobileService.syncInstalled(uidOf(req), body?.list || []);
  }

  @Get("modules/:code/versions")
  versions(@Param("code") code: string) {
    return this.mobileService.listVersions(decodeURIComponent(code));
  }

  @Post("modules/:code/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:app:publish")
  setPerms(
    @Param("code") code: string,
    @Body() body: { permissionCodes?: string[] },
  ) {
    return this.mobileService.setModulePermissions(
      decodeURIComponent(code),
      body?.permissionCodes || [],
    );
  }

  @Get("shell/releases")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:shell:release")
  shellList() {
    return this.mobileService.listShellReleases();
  }

  @Post("shell/releases")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:shell:release")
  shellCreate(@Body() body: Record<string, unknown>) {
    return this.mobileService.createShellRelease(body as never);
  }

  // ---- P1: search / feedback / faq / banners / preview / debug / push / sign ----

  @Get("search")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("mobile:search:use")
  search(@Query() query: Record<string, string>, @Req() req: AuthedReq) {
    return this.mobileP1.search(uidOf(req), query.q || "");
  }

  @Post("feedback")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("mobile:feedback:submit")
  feedback(
    @Body()
    body: { content?: string; contact?: string; diagnostics?: unknown },
    @Req() req: AuthedReq,
  ) {
    return this.mobileP1.submitFeedback(uidOf(req), body || {});
  }

  @Public()
  @Get("faq")
  faq() {
    return this.mobileP1.listFaq();
  }

  @Get("ops/banners")
  banners(@Query() query: Record<string, string>, @Req() req: AuthedReq) {
    return this.mobileP1.listBanners(query.platform, uidOf(req));
  }

  @Get("ops/banners/admin")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:app:ops")
  bannersAdmin() {
    return this.mobileP1.listBannersAdmin();
  }

  @Post("ops/banners")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:app:ops")
  bannerUpsert(@Body() body: Record<string, unknown>) {
    return this.mobileP1.upsertBanner(body || {});
  }

  @Post("preview/create")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:app:publish")
  previewCreate(
    @Body()
    body: {
      moduleCode?: string;
      moduleUrl?: string;
      name?: string;
      ttlSec?: number;
    },
    @Req() req: AuthedReq,
  ) {
    return this.mobileP1.createPreview(body || {}, uidOf(req));
  }

  @Public()
  @Get("preview/resolve")
  previewResolve(@Query() query: Record<string, string>) {
    return this.mobileP1.resolvePreview(query.token);
  }

  @Get("debug/whitelist")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:app:publish")
  debugList() {
    return this.mobileP1.listDebugWhitelist();
  }

  @Post("debug/whitelist")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:app:publish")
  debugAdd(@Body() body: { pattern?: string; remark?: string }) {
    return this.mobileP1.addDebugWhitelist(body || {});
  }

  @Post("debug/checkUrl")
  checkDebug(@Body() body: { url?: string }) {
    return this.mobileP1.checkDebugUrl(body?.url);
  }

  @Public()
  @Get("package/publicKey")
  publicKey() {
    return this.mobileP1.getPackagePublicKey();
  }

  @Post("package/sign")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("system:app:publish")
  signPackage(@Body() body: { checksum?: string }) {
    return this.mobileP1.signChecksum(body?.checksum);
  }

  @Post("push/register")
  pushRegister(
    @Body()
    body: {
      token?: string;
      channel?: string;
      platform?: string;
      shellVersion?: string;
    },
    @Req() req: AuthedReq,
  ) {
    return this.mobileP1.registerPush(uidOf(req), body || {});
  }

  @Get("push/prefs")
  pushPrefsGet(@Req() req: AuthedReq) {
    return this.mobileP1.getPushPrefs(uidOf(req));
  }

  @Post("push/prefs")
  pushPrefsSet(
    @Body() body: { enable?: boolean; categories?: Record<string, boolean> },
    @Req() req: AuthedReq,
  ) {
    return this.mobileP1.setPushPrefs(uidOf(req), body || {});
  }
}
