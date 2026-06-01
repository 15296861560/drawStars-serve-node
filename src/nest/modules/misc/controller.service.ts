import { Injectable } from "@nestjs/common";
import path from "path";
import fs from "fs";
import util from "util";
import child_process from "child_process";
import config from "../../../config/publish-config";

const exec = util.promisify(child_process.exec);

@Injectable()
export class ControllerService {
  getPracticeContent() {
    const practice = path.join(process.cwd(), "public/static/practice.html");
    return fs.readFileSync(practice, "utf-8");
  }

  async getCommitInfo() {
    return new Promise<Array<{ date?: string; feat?: string }>>(
      (resolve, reject) => {
        const content: Array<{ date?: string; feat?: string }> = [];
        const command = "cd .. | git log";
        const child = child_process.exec(command, { cwd: process.cwd() }, (e) => {
          if (e) reject(e);
        });

        child.stdout?.on("data", (data: string) => {
          const lines = data.split("commit");
          lines.forEach((line) => {
            if (line.includes("Date") && line.includes("feat")) {
              const commits = line.split("\n");
              const commit: { date?: string; feat?: string } = {};
              commits.forEach((item) => {
                if (item.startsWith("Date")) commit.date = item.slice(8);
                else if (item.includes("feat")) commit.feat = item.slice(9);
              });
              content.push(commit);
            }
          });
        });
        child.on("exit", () => resolve(content));
      },
    );
  }

  async compressCode(content: string) {
    let bundle = "";
    let status = true;
    try {
      const clearCommand = "rmdir /Q /S dist";
      const packCommand = "webpack";

      const compressPath = path.join(process.cwd(), "public/compress");
      const distPath = path.join(compressPath, "dist", "bundle.js");
      const entryPath = path.join(compressPath, "src", "entry.js");

      if (fs.existsSync(distPath)) {
        await exec(clearCommand, { cwd: compressPath });
      }
      fs.writeFileSync(entryPath, content);
      await exec(packCommand, { cwd: compressPath });
      bundle = fs.readFileSync(distPath, "utf-8");
    } catch (e) {
      status = false;
      bundle = String(e);
    }
    return { status, data: bundle };
  }

  getUploadDir() {
    return config.uploadDir || path.join(process.cwd(), "uploadDir");
  }
}
