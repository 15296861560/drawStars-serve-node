import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import fs from "fs";
import path from "path";
import { Formidable } from "formidable";
import { ControllerService } from "./controller.service";

@Controller("controller")
export class ControllerController {
  constructor(private readonly controllerService: ControllerService) {}

  @Post("practice/getContent")
  getPracticeContent() {
    return { status: true, data: this.controllerService.getPracticeContent() };
  }

  @Post("getCommitInfo")
  async getCommitInfo() {
    const data = await this.controllerService.getCommitInfo();
    return { status: true, data };
  }

  @Post("compressCode")
  async compressCode(@Body() body: { content: string }) {
    return this.controllerService.compressCode(body.content);
  }

  @Post("upload")
  upload(@Req() req: unknown, @Res() res: unknown) {
    const response = res as import("express").Response;
    const form = new Formidable({
      uploadDir: this.controllerService.getUploadDir(),
      keepExtensions: true,
      maxFieldsSize: 10 * 1024 * 1024,
    });
    let newName = "";

    form.parse(req as import("express").Request, (err, fields, files) => {
      if (err) {
        response.status(500).json({ status: false, data: err });
        return;
      }

      const orgName = fields.filename?.[0] as string;
      const oldpath = files.file?.[0]?.filepath;
      if (!oldpath) {
        response.status(400).json({ status: false, data: "缺少文件" });
        return;
      }

      newName = `${Date.now()}_${orgName}`;
      const newpath = path.join(this.controllerService.getUploadDir(), newName);
      fs.rename(oldpath, newpath, (renameErr) => {
        if (renameErr) {
          response.status(500).json({ status: false, data: renameErr });
          return;
        }
        response.status(200).json({
          status: true,
          data: { url: `/${newName}`, msg: "上传成功" },
        });
      });
    });
  }

  @Get("download")
  download(@Query("filename") filename: string, @Res() res: unknown) {
    const response = res as import("express").Response;
    const pathUrl = path.join(this.controllerService.getUploadDir(), filename);
    const readStream = fs.createReadStream(pathUrl);
    const stats = fs.statSync(pathUrl);
    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=" + path.basename(pathUrl),
      "Content-Length": stats.size,
    });
    readStream.pipe(response);
  }
}
