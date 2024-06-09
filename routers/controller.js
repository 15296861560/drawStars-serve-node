/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-05-23 21:08:51
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2024-05-19 22:59:21
 */
const express = require('express');
const router = express.Router();
const path = require("path");
const fs = require("fs");
const util = require('util');
const child_process = require('child_process');
const { Formidable } = require('formidable');

const config = require('../config/publish-config')



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

// 处理上传文件服务
router.post('/upload', (req, res) => {
  const options = {
    uploadDir: config.uploadDir,// 设置文件上传目录
    keepExtensions: true, // 保持文件的后缀
    maxFieldsSize: 10 * 1024 * 1024, // 文件上传大小限制
    onFileBegin: (name, file) => { // 文件上传前的设置
      console.log(`name: ${name}`);
      // console.log(file);
    }
  }

  const form = new Formidable(options)
  let newName = ''
  try {
    form.parse(req, (err, fielads, files) => {
      // console.log("fielads", fielads);
      // console.log("files", files);
      const orgName = fielads.filename[0];
      // let extname = path.extname(orgName);
      const oldpath = files.file[0].filepath
      newName = `${new Date().getTime()}_${orgName}`
      const newpath = path.join(config.uploadDir, newName);

      fs.rename(oldpath, newpath, function (err) {
        if (err) {
          throw Error("改名失败");
        }
      });
      if (err) {
        console.error('Error', err)
        throw err
      }
    });
    // form.on('progress', (bytesReceived, bytesExpected) => {
    //   console.log("收到的字节数" + bytesReceived);
    //   console.log("预期字节数" + bytesExpected);
    // });
    // form.on('field', (name, value) => {
    //   console.log(name + " = " + value);
    // });
    // form.on('fileBegin', (name, file) => {
    //   console.log(name + " = ", file);
    // });
    // form.on('file', (name, file) => {
    //   console.log(name + " = ", file);
    // });

  } catch (e) {
    res.status(500).json({
      "status": false,
      "data": e
    });
  }
  form.on('end', () => {
    console.log('结束解析');
    res.status(200).json({
      "status": true,
      "data": { url: `/${newName}`, msg: '上传成功' }
    });
  });

});



/**
 * 下载文件
 */
const downloadFile = (pathUrl, res) => {

  const readStream = fs.createReadStream(pathUrl);

  const stats = fs.statSync(pathUrl);

  const filename = path.basename(pathUrl);

  res.writeHead(200, {
    'Content-Type': 'application/octet-stream', //告诉浏览器这是一个二进制文件
    'Content-Disposition': 'attachment; filename=' + filename, //告诉浏览器这是一个需要下载的文件
    'Content-Length': stats.size
  });

  readStream.pipe(res);

}

router.get('/download', function (req, res) {
  const filename = req.query.filename
  const pathUrl = path.join(config.uploadDir, filename)
  downloadFile(pathUrl, res)
});



module.exports = router;