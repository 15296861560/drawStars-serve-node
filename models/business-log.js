const db = require('../public/db/mysql/base')

class BusinessLog {
  static async find(query) {
    let sql = 'SELECT * FROM business_log WHERE 1=1'
    const values = []
    
    if (query.module) {
      sql += ' AND module = ?'
      values.push(query.module)
    }
    if (query.type) {
      sql += ' AND type = ?'
      values.push(query.type)
    }
    if (query.operator) {
      sql += ' AND operator LIKE ?'
      values.push(`%${query.operator}%`)
    }
    if (query.create_time) {
      sql += ' AND create_time BETWEEN ? AND ?'
      values.push(query.create_time.$gte, query.create_time.$lte)
    }

    // 添加排序支持
    if (query.sort) {
      const sortField = Object.keys(query.sort)[0]
      const sortOrder = query.sort[sortField] === 1 ? 'ASC' : 'DESC'
      sql += ` ORDER BY ${sortField} ${sortOrder}`
    }

    // 添加分页支持
    if (query.skip && query.limit) {
      sql += ' LIMIT ?, ?'
      values.push(query.skip, query.limit)
    }

    return new Promise((resolve, reject) => {
      db.selectData(sql, values, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  static async countDocuments(query) {
    let sql = 'SELECT COUNT(*) as count FROM business_log WHERE 1=1'
    const values = []
    
    if (query.module) {
      sql += ' AND module = ?'
      values.push(query.module)
    }
    if (query.type) {
      sql += ' AND type = ?'
      values.push(query.type)
    }
    if (query.operator) {
      sql += ' AND operator LIKE ?'
      values.push(`%${query.operator}%`)
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
      db.selectData('DELETE FROM business_log WHERE log_id = ?', [id], (err, result) => {
        if (err) reject(err)
        else resolve(result.affectedRows > 0)
      })
    })
  }
}

module.exports = BusinessLog