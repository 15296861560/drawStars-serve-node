const db = require('./base.js')

function getAppInfo(appName) {
  return new Promise((resolve, reject) => {
    let values=[appName];
    db.selectData(`select * from app_info where app_name = ?`,values, (e, r) => {
      if (!r.length) {
        console.log("无该app信息")
      } else {
        resolve(r[0]);
      }
      if (e) {
        reject(e)
      }
    })
  })

}

exports.getAppInfo = getAppInfo;
