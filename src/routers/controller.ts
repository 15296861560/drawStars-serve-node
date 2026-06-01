import express from "express";
import path from "path";
import fs from "fs";
import util from "util";
import child_process from "child_process";
import { Formidable } from "formidable";
import config from "../config/publish-config";

const router = express.Router();
const exec = util.promisify(child_process.exec);

router.post("/practice/getContent", (_req, res) => {
  const practice = path.join(__dirname, "../../public/static", "practice.html");
  const content = fs.readFileSync(practice, "utf-8");
  res.status(200).json({ status: true, data: content });
});

router.post("/getCommitInfo", (_req, res) => {
  const promise = new Promise<Array<{ date?: string; feat?: string }>>(
    (resolve, reject) => {
      const content: Array<{ date?: string; feat?: string }> = [];
      const command = "cd .. | git log";
      const child = child_process.exec(
        command,
        { cwd: __dirname },
        (error) => {
          if (error) reject();
        },
      );

      child.stdout?.on("data", (data: string) => {
        const lines = data.split("commit");
        lines.forEach((line) => {
          if (line.indexOf("Date") > -1 && line.indexOf("feat") > -1) {
            const commits = line.split("\n");
            const commit: { date?: string; feat?: string } = {};
            commits.forEach((item) => {
              if (item.startsWith("Date")) {
                commit.date = item.slice(8);
              } else if (item.indexOf("feat") > -1) {
                commit.feat = item.slice(9);
              }
            });
            content.push(commit);
          }
        });
      });

      child.on("exit", (code) => {
        resolve(content);
        console.log("子进程已退出，退出码 " + code);
      });
    },
  );

  promise.then((content) => {
    res.status(200).json({ status: true, data: content });
  });
});

function isExists(pathWay: string) {
  return new Promise<boolean>((resolve) => {
    fs.exists(pathWay, (exists) => resolve(!!exists));
  });
}

function writeFile(filePath: string, content: string) {
  const fd = fs.openSync(filePath, "w");
  fs.writeSync(fd, content);
  fs.closeSync(fd);
}

router.post("/compressCode", async (req, res) => {
  let bundle = "";
  let status = true;
  try {
    const clearCommand = "rmdir /Q /S dist";
    const packCommand = "webpack";
    const compressPath = path.join(__dirname, "../../public/compress");
    const distPath = path.join(compressPath, "dist", "bundle.js");
    const entryPath = path.join(compressPath, "src", "entry.js");
    const exists = await isExists(distPath);
    if (exists) {
      await exec(clearCommand, { cwd: compressPath });
    }
    writeFile(entryPath, req.body.content);
    await exec(packCommand, { cwd: compressPath });
    bundle = fs.readFileSync(distPath, "utf-8");
  } catch (e) {
    status = false;
    bundle = String(e);
  }

  res.status(200).json({ status, data: bundle });
});

router.post("/upload", (req, res) => {
  const options = {
    uploadDir: config.uploadDir,
    keepExtensions: true,
    maxFieldsSize: 10 * 1024 * 1024,
  };

  const form = new Formidable(options);
  let newName = "";

  try {
    form.parse(req, (err, fields, files) => {
      const orgName = fields.filename?.[0] as string;
      const oldpath = files.file?.[0]?.filepath;
      if (!oldpath) return;
      newName = `${new Date().getTime()}_${orgName}`;
      const newpath = path.join(config.uploadDir!, newName);
      fs.rename(oldpath, newpath, (renameErr) => {
        if (renameErr) throw Error("改名失败");
      });
      if (err) throw err;
    });
  } catch (e) {
    res.status(500).json({ status: false, data: e });
    return;
  }

  form.on("end", () => {
    console.log("结束解析");
    res.status(200).json({
      status: true,
      data: { url: `/${newName}`, msg: "上传成功" },
    });
  });
});

const downloadFile = (pathUrl: string, res: express.Response) => {
  const readStream = fs.createReadStream(pathUrl);
  const stats = fs.statSync(pathUrl);
  const filename = path.basename(pathUrl);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": "attachment; filename=" + filename,
    "Content-Length": stats.size,
  });
  readStream.pipe(res);
};

router.get("/download", (req, res) => {
  const filename = req.query.filename as string;
  const pathUrl = path.join(config.uploadDir!, filename);
  downloadFile(pathUrl, res);
});

export default router;
