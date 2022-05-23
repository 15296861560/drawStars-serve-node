const conn = require('../../../config/mysql-config.js');
const connection = conn();

// 查询所有数据
let selectData = (sql, callback) => {
  connection.query(sql, (err, result) => {
    if (err) {
      console.log('错误信息-', err.sqlMessage);
      let errNews = err.sqlMessage;
      callback(errNews, '');
      return;
    }
    let string = JSON.stringify(result);
    let data = JSON.parse(string);
    callback('', data);
  })
}
// 插入一条数据
let insertData = (table, datas, callback) => {
  let fields = '';
  let values = '';
  for (let k in datas) {
    fields += k + ',';
    values = values + "'" + datas[k] + "',"
  }
  fields = fields.slice(0, -1);
  values = values.slice(0, -1);
  let sql = "INSERT INTO " + table + '(' + fields + ') VALUES(' + values + ')';
  connection.query(sql, callback);
}
// 更新一条数据
let updateData = function (table, sets, where, callback) {
  let _SETS = '';
  let _WHERE = '';
  for (let k in sets) {
    _SETS += k + "=" + sets[k] + ",";
  }
  _SETS = _SETS.slice(0, -1);
  for (let k2 in where) {
    _WHERE += k2 + "=" + where[k2];
  }
  let sql = "UPDATE " + table + ' SET ' + _SETS + ' WHERE ' + _WHERE;
  connection.query(sql, callback);
}

// 删除一条数据
let deleteData = function (table, where, callback) {
  let _WHERE = '';
  for (let k in where) {
    //多个筛选条件使用  _WHERE+=k+"='"+where[k]+"' AND ";
    _WHERE += k + "=" + where[k];
  }
  let sql = "DELETE  FROM " + table + ' WHERE ' + _WHERE;
  connection.query(sql, callback);
}






exports.selectData = selectData;
exports.insertData = insertData;
exports.deleteData = deleteData;
exports.updateData = updateData;
