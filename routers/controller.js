/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-05-23 21:08:51
 * @LastEditors: lgy
 * @LastEditTime: 2022-09-29 23:31:41
 */
const express = require('express');
const router = express.Router();
const path = require("path");
const fs = require("fs");
const util = require('util');
const child_process = require('child_process');


// 获取初始模板信息
router.post('/practice/getContent', function (req, res) {
  let practice = path.join(__dirname, "../public/static", "practice.html");
  let content = fs.readFileSync(practice, "utf-8");

  res.status(200).json({
    "status": true,
    "data": content
  });
});

//获取本地提交记录
router.post('/getCommitInfo', function (req, res) {

  let promise = new Promise((resolve, reject) => {
    let content = [];
    let command = "cd .. | git log";

    let child = child_process.exec(command, {
      cwd: __dirname
    }, function (error, stdout, stderr) {
      if (error) {
        reject();
      }

    })

    child.stdout.on('data', (data) => {
      // 提取提交信息
      let lines = data.split("commit");
      lines.forEach(line => {
        if (line.indexOf("Date") > -1 && line.indexOf("feat") > -1) {
          let commits = line.split("\n");
          let commit = {};
          commits.forEach(item => {
            if (item.startsWith("Date")) {
              commit["date"] = item.slice(8);
            } else if (item.indexOf("feat") > -1) {
              commit["feat"] = item.slice(9);
            }
          })
          content.push(commit);
        }
      });

    });

    child.on('exit', function (code) {
      resolve(content)
      console.log('子进程已退出，退出码 ' + code);
    });
  })

  promise.then(content => {
    res.status(200).json({
      "status": true,
      "data": content
    });
  })


});

function isExists(path_way) {
  return new Promise((resolve, reject) => {
    fs.exists(path_way, function (exists) {
      exists ? resolve(true) : resolve(false)
    });
  })
}

function writeFile(filePath, content) {
  let fd = fs.openSync(filePath, "w");
  fs.writeSync(fd, content);
  fs.closeSync(fd)
}

//压缩代码
router.post('/compressCode', async function (req, res) {
  let bundle = "";
  let status = true;
  try {
    const exec = util.promisify(child_process.exec);
    let clearCommand = "rmdir /Q /S dist";
    let packCommand = "webpack";

    let compressPath = path.join(__dirname, "../public/compress");
    let distPath = path.join(compressPath, "dist", "bundle.js");
    let entryPath = path.join(compressPath, "src", "entry.js");
    // 判断文件夹是否为空
    let exists = await isExists(distPath);
    if (exists) {
      await exec(clearCommand, {
        cwd: compressPath
      })

    }
    // 写入文件
    let content = req.body.content;
    writeFile(entryPath, content)


    // 打包
    await exec(packCommand, {
      cwd: compressPath
    })

    bundle = fs.readFileSync(distPath, "utf-8");
  } catch (e) {
    status = false;
    bundle = e;
  }

  res.status(200).json({
    "status": status,
    "data": bundle
  });

});

module.exports = router;