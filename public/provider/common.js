const db = require('../db/mysql/base')

class CommoModel {
  constructor(tableName, eqFields = [], likeFields = []) {
    this.tableName = tableName;
    this.eqFields = eqFields
    this.likeFields = likeFields
    this.idField = 'id'
  }
  updateIdField(idField = 'id') {
    this.idField = idField
  }

  async find(query) {
    let sql = `SELECT * FROM ${this.tableName} WHERE 1=1`
    const values = []

    this.eqFields.forEach(field => {
      if (query[field]) {
        sql += ` AND ${field} = ?`
        values.push(query[field])
      }
    });
    this.likeFields.forEach(field => {
      if (query[field]) {
        sql += ` AND ${field} LIKE ?`
        values.push(`%${query[field]}%`)
      }
    });

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
  async findById(id = '') {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${this.idField} = ?`
    const values = [id]

    return new Promise((resolve, reject) => {
      db.selectData(sql, values, (err, result) => {
        if (err) reject(err)
        else resolve(result[0])
      })
    })
  }
  async findByField(field = 'id', fieldValue = '') {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${field} = ?`
    const values = [fieldValue]

    return new Promise((resolve, reject) => {
      db.selectData(sql, values, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  async create(createData) {
    return new Promise((resolve, reject) => {
      db.insertData(this.tableName, createData, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }
  async update(updateData, idValue) {
    return new Promise((resolve, reject) => {

      const where = {
        [this.idField]: idValue
      }

      db.updateData(this.tableName, updateData, where, (err, result) => {
        if (err) reject(err)
        else resolve(result)
      })
    })
  }

  async countDocuments(query) {
    let sql = `SELECT COUNT(*) as count FROM ${this.tableName} WHERE 1=1`
    const values = []

    this.eqFields.forEach(field => {
      if (query[field]) {
        sql += ` AND ${field} = ?`
        values.push(query[field])
      }
    });
    this.likeFields.forEach(field => {
      if (query[field]) {
        sql += ` AND ${field} LIKE ?`
        values.push(`%${query[field]}%`)
      }
    });

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

  async deleteById(id) {
    return new Promise((resolve, reject) => {
      db.selectData(`DELETE FROM ${this.tableName} WHERE ${this.idField} = ?`, [id], (err, result) => {
        if (err) reject(err)
        else resolve(result.affectedRows > 0)
      })
    })
  }
}

module.exports = CommoModel