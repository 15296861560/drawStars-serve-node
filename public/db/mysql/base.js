/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-05-23 21:08:51
 * @LastEditors: lgy
 * @LastEditTime: 2022-08-14 00:28:12
 */
const conn = require('../../../config/mysql-config.js');
const connection = conn();

// 查询所有数据
/**
 * @description: 
 * @param {String} sql
 * @param {Array} values
 * @param {Function} callback
 * @return {*}
 * @author: lgy
 */
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
/**
 * @description: 
 * @param {String} table 表名
 * @param {key:value} datas 插入对象键值对
 * @param {Function} callback 回调函数
 * @return {*}
 * @author: lgy
 */
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
/**
 * @description: 
 * @param {String} table 表名
 * @param {key:value} sets 更新的键值对
 * @param {key:value} where 判断条件
 * @param {Function} callback 回调函数
 * @return {*}
 * @author: lgy
 */
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
/**
 * @description: 
 * @param {String} table 表名
 * @param {key:value} where 判断条件
 * @param {Function} callback 回调函数
 * @return {*}
 * @author: lgy
 */
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

// 批量插入
/**
 * @description: 
 * @param {String} table 表名
 * @param {Array} keys 健列表
 * @param {[[]]} datas 插入数据列表
 * @param {Function} callback 回调函数
 * @return {*}
 * @author: lgy
 */
let batchInsertData = (table, keys, datas, callback) => {
  let fields = '';
  keys.forEach(k => {
    fields += k + ',';
  })
  fields = fields.slice(0, -1);

  let values = [];
  let questions = '(';
  datas.forEach(arr => {
    arr.forEach(v => {
      questions += "?,";
      values.push(v);
    })
    questions = questions.slice(0, -1);
    questions += '),('
  })
  questions = questions.slice(0, -2);
  let sql = "INSERT INTO " + table + '(' + fields + ') VALUES' + questions;
  connection.query(sql, values, callback);
}



module.exports = {
  selectData,
  insertData,
  deleteData,
  updateData,
  batchInsertData
}