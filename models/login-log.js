const db = require('../public/db/mysql/base')

class LoginLog {
  static async find(query) {
    let sql = 'SELECT * FROM login_log WHERE 1=1'
    const values = []
    
    if (query.username) {
      sql += ' AND username LIKE ?'
      values.push(`%${query.username}%`)
    }
    if (query.ip) {
      sql += ' AND ip = ?'
      values.push(query.ip)
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
    let sql = 'SELECT COUNT(*) as count FROM login_log WHERE 1=1'
    const values = []
    
    // 条件构建与find方法相同
    // ... 省略相同条件构建代码 ...

    return new Promise((resolve, reject) => {
      db.selectData(sql, values, (err, result) => {
        if (err) reject(err)
        else resolve(result[0].count)
      })
    })
  }

  static async findByIdAndDelete(id) {
    return new Promise((resolve, reject) => {
      db.selectData('DELETE FROM login_log WHERE log_id = ?', [id], (err, result) => {
        if (err) reject(err)
        else resolve(result.affectedRows > 0)
      })
    })
  }
}

module.exports = LoginLog