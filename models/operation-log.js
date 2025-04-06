const db = require('../public/db/mysql/base')

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