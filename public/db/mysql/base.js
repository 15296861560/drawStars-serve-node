const conn = require('../../../config/mysql-config.js');
const connection = conn();

// 查询所有数据
let selectData = (sql, values = [], callback) => {
  connection.query(sql, values, (err, result) => {
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
  let questions = '';
  let values = [];
  for (let k in datas) {
    fields += k + ',';
    questions = questions + "?,";
    values.push(datas[k]);
  }
  fields = fields.slice(0, -1);
  questions = questions.slice(0, -1);
  let sql = "INSERT INTO " + table + '(' + fields + ') VALUES(' + questions + ')';
  connection.query(sql, values, callback);
}
// 更新一条数据
let updateData = function (table, sets, where, callback) {
  let _SETS = '';
  let _WHERE = '';
  let values = [];
  for (let k in sets) {
    _SETS += k + "=?,";
    values.push(sets[k]);
  }
  _SETS = _SETS.slice(0, -1);
  for (let k2 in where) {
    _WHERE += k2 + "=?";
    values.push(where[k2]);
  }
  let sql = "UPDATE " + table + ' SET ' + _SETS + ' WHERE ' + _WHERE;
  connection.query(sql, values, callback);
}

// 删除一条数据
let deleteData = function (table, where, callback) {
  let _WHERE = '';
  let values = [];
  for (let k in where) {
    //多个筛选条件使用  _WHERE+=k+"='"+where[k]+"' AND ";
    _WHERE += k + "=?";
    values.push(where[k]);
  }
  let sql = "DELETE  FROM " + table + ' WHERE ' + _WHERE;
  connection.query(sql, values, callback);
}






exports.selectData = selectData;
exports.insertData = insertData;
exports.deleteData = deleteData;
exports.updateData = updateData;