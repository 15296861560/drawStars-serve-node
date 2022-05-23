const express = require('express');
const router = express.Router();
const path = require("path");

// 获取初始模板信息
router.post('/practice/getContent', function (req, res) {
  const fs = require("fs");
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
    const child_process = require('child_process');
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

module.exports = router;
