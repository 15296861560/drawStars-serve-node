const mysql = require('mysql')
const config = require('./publish-config')
const mysqlConfig = config.mysql || {}


const pool = mysql.createPool({
  host: mysqlConfig.host,
  port: mysqlConfig.port,
  user: mysqlConfig.user,
  password: mysqlConfig.password,
  database: mysqlConfig.database,
  useConnectionPooling: true,
});

const connectdb = {};

connectdb.query = function (sql, params, callback) {

  return new Promise((resolve, reject) => {
    // 取出链接
    pool.getConnection(function (err, connection) {

      if (err) {
        reject(err);
        return;
      }

      connection.query(sql, params, function (error, results, fields) {
        // 释放连接
        connection.release();
        if (error) {
          console.log(`${sql}=>${params}`);
          console.log('error', error)
          reject(error);
          return;
        }
        callback(error, results, fields)
        resolve(results);
      });

    });
  });
}
// 导出对象
module.exports = connectdb;