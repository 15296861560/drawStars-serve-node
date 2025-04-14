const db = require('../../db/mysql/base')

// 格式化日期为MySQL兼容格式的辅助函数
const formatMySQLDateTime = (date) => {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

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
    if (query.limit) {
      sql += ' LIMIT ?, ?'
      values.push(query.skip, Number(query.limit))
    }

    return new Promise((resolve, reject) => {
      db.selectData(sql, values, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  static async create(logData) {
    const { module, type, title, content, operator } = logData

    // 使用格式化函数创建MySQL兼容的日期时间格式
    const mysqlDateTime = formatMySQLDateTime(new Date())

    const logRecord = {
      module,
      type,
      title,
      content: content ? (typeof content === 'string' ? content : JSON.stringify(content)) : '',
      operator,
      create_time: mysqlDateTime
    }

    return new Promise((resolve, reject) => {
      db.insertData('business_log', logRecord, (err, result) => {
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