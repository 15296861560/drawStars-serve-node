const db = require('../../db/mysql/base')

// 格式化日期为MySQL兼容格式的辅助函数
const formatMySQLDateTime = (date) => {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

class OperationLog {
  static async find(query) {
    let sql = 'SELECT * FROM operation_log WHERE 1=1'
    const values = []
    
    if (query.username) {
      sql += ' AND username LIKE ?'
      values.push(`%${query.username}%`)
    }
    if (query.operation) {
      sql += ' AND operation = ?'
      values.push(query.operation)
    }
    if (query.status) {
      sql += ' AND status = ?'
      values.push(query.status)
    }
    if (query.create_time) {
      sql += ' AND create_time BETWEEN ? AND ?'
      values.push(query.create_time.$gte, query.create_time.$lte)
    }

    return new Promise((resolve, reject) => {
      db.selectData(sql, values, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  static async create(logData) {
    const { username, operation, method, params, ip, status, error_msg } = logData
    
    // 使用格式化函数创建MySQL兼容的日期时间格式
    const mysqlDateTime = formatMySQLDateTime(new Date())

    const logRecord = {
      username,
      operation,
      method: method || '',
      params: params ? (typeof params === 'string' ? params : JSON.stringify(params)) : '',
      ip,
      status,
      error_msg: error_msg || '',
      create_time: mysqlDateTime
    }

    return new Promise((resolve, reject) => {
      db.insertData('operation_log', logRecord, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  static async countDocuments(query) {
    let sql = 'SELECT COUNT(*) as count FROM operation_log WHERE 1=1'
    const values = []
    
    if (query.username) {
      sql += ' AND username LIKE ?'
      values.push(`%${query.username}%`)
    }
    if (query.operation) {
      sql += ' AND operation = ?'
      values.push(query.operation)
    }
    if (query.status) {
      sql += ' AND status = ?'
      values.push(query.status)
    }
    if (query.create_time) {
      sql += ' AND create_time BETWEEN ? AND ?'
      values.push(query.create_time.$gte, query.create_time.$lte)
    }

    return new Promise((resolve, reject) => {
      db.selectData(sql, values, (err, result) => {
        if (err) reject(err)
        else resolve(result[0].count)
      })
    })
  }

  static async findByIdAndDelete(id) {
    return new Promise((resolve, reject) => {
      db.selectData('DELETE FROM operation_log WHERE log_id = ?', [id], (err, result) => {
        if (err) reject(err)
        else resolve(result.affectedRows > 0)
      })
    })
  }
}

module.exports = OperationLog