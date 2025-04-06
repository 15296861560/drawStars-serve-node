const LoginLog = require('../provider/log/login-log')
const OperationLog = require('../provider/log/operation-log')
const BusinessLog = require('../provider/log/business-log')
const excel = require('exceljs')

class LogService {
  // 查询登录日志
  static async getLoginLogs({ username, ip, status, startTime, endTime, page = 1, pageSize = 10 }) {
    const query = {}
    if (username) query.username = username
    if (ip) query.ip = ip
    if (status) query.status = status
    if (startTime && endTime) {
      query.create_time = { $gte: new Date(startTime), $lte: new Date(endTime) }
    }

    const [logs, total] = await Promise.all([
      LoginLog.find({
        ...query,
        sort: {create_time: -1},
        skip: (page - 1) * pageSize,
        limit: pageSize
      }),
      LoginLog.countDocuments(query)
    ])

    return { list: logs, total, page, pageSize }
  }

  // 查询操作日志
  static async getOperationLogs({ username, operation, status, startTime, endTime, page = 1, pageSize = 10 }) {
    const query = {}
    if (username) query.username = username
    if (operation) query.operation = operation
    if (status) query.status = status
    if (startTime && endTime) {
      query.create_time = { $gte: new Date(startTime), $lte: new Date(endTime) }
    }

    const [logs, total] = await Promise.all([
      OperationLog.find({
        ...query,
        sort: {create_time: -1},
        skip: (page - 1) * pageSize,
        limit: pageSize
      }),
      OperationLog.countDocuments(query)
    ])

    return { list: logs, total, page, pageSize }
  }

  // 查询业务日志
  static async getBusinessLogs({ module, type, operator, startTime, endTime, page = 1, pageSize = 10 }) {
    const query = {}
    if (module) query.module = module
    if (type) query.type = type
    if (operator) query.operator = operator // 移除了Mongoose特有的$regex语法
    if (startTime && endTime) {
      query.create_time = { $gte: new Date(startTime), $lte: new Date(endTime) }
    }

    const [logs, total] = await Promise.all([
      BusinessLog.find({
        ...query,
        sort: {create_time: -1},
        skip: (page - 1) * pageSize,
        limit: pageSize
      }),
      BusinessLog.countDocuments(query)
    ])

    return { list: logs, total, page, pageSize }
  }

  // 获取日志统计
  static async getLogStatistics({ startTime, endTime }) {
    const timeCondition = startTime && endTime ? { 
      create_time: { $gte: new Date(startTime), $lte: new Date(endTime) } 
    } : {}

    // 获取基础统计数据
    const [loginCount, operationCount, errorLoginCount, errorOperationCount] = await Promise.all([
      LoginLog.countDocuments(timeCondition),
      OperationLog.countDocuments(timeCondition),
      LoginLog.countDocuments({ ...timeCondition, status: 'fail' }),
      OperationLog.countDocuments({ ...timeCondition, status: 'fail' })
    ])

    // 获取24小时登录数据
    const hours = Array.from({length: 24}, (_, i) => i)
    const loginHourData = await Promise.all(hours.map(async hour => {
      const hourStart = new Date(startTime)
      hourStart.setHours(hour, 0, 0, 0)
      const hourEnd = new Date(hourStart)
      hourEnd.setHours(hour, 59, 59, 999)
      
      const [success, fail] = await Promise.all([
        LoginLog.countDocuments({ 
          ...timeCondition, 
          create_time: { $gte: hourStart, $lte: hourEnd },
          status: 'success'
        }),
        LoginLog.countDocuments({ 
          ...timeCondition, 
          create_time: { $gte: hourStart, $lte: hourEnd },
          status: 'fail'
        })
      ])
      
      return { hour, success, fail }
    }))

    // 获取操作类型分布
    const operationTypes = ['insert', 'update', 'delete', 'select']
    const operationTypeData = await Promise.all(
      operationTypes.map(type => 
        OperationLog.countDocuments({ ...timeCondition, operation: type })
      )
    )

    return {
      loginCount,
      operationCount,
      errorLoginCount,
      errorOperationCount,
      charts: {
        loginChart: {
          dates: hours.map(h => `${h}:00`),
          success: loginHourData.map(d => d.success),
          fail: loginHourData.map(d => d.fail)
        },
        operationChart: {
          types: operationTypes,
          counts: operationTypeData
        }
      }
    }
}

  // 删除日志
  static async deleteLog(id) {
    const result = await Promise.all([
      LoginLog.findByIdAndDelete(id),
      OperationLog.findByIdAndDelete(id),
      BusinessLog.findByIdAndDelete(id)
    ])
    
    if (!result.some(r => r)) {
      throw new Error('未找到对应日志记录')
    }
  }

  // 批量删除日志
  static async batchDeleteLogs(ids) {
    await Promise.all([
      LoginLog.deleteMany({ _id: { $in: ids } }),
      OperationLog.deleteMany({ _id: { $in: ids } }),
      BusinessLog.deleteMany({ _id: { $in: ids } })
    ])
  }

  // 导出日志
  static async exportLogs(type, params) {
      let logs = []
      let filename = ''
      
      switch (type) {
        case 'login':
          logs = await LoginLog.find(this.buildQuery(params))
          filename = `登录日志_${new Date().toISOString()}.xlsx`
          break
        case 'operation':
          logs = await OperationLog.find(this.buildQuery(params))
          filename = `操作日志_${new Date().toISOString()}.xlsx`
          break
        case 'business':
          logs = await BusinessLog.find(this.buildQuery(params))
          filename = `业务日志_${new Date().toISOString()}.xlsx`
          break
        default:
          throw new Error('不支持的日志类型')
      }
  
      const workbook = new excel.Workbook()
      const worksheet = workbook.addWorksheet('日志数据')
  
      // 添加表头
      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: '用户名', key: 'username', width: 20 },
        { header: '操作类型', key: 'operation', width: 15 },
        { header: 'IP地址', key: 'ip', width: 15 },
        { header: '状态', key: 'status', width: 10 },
        { header: '时间', key: 'create_time', width: 20 }
      ]
  
      // 添加数据
      logs.forEach(log => {
        worksheet.addRow({
          id: log.id || log._id,
          username: log.username,
          operation: log.operation || log.type || log.module,
          ip: log.ip,
          status: log.status,
          create_time: log.create_time
        })
      })
  
      const buffer = await workbook.xlsx.writeBuffer()
      return { filename, data: buffer }
  }

  static buildQuery(params) {
    const query = {}
    if (params.username) query.username = params.username
    if (params.ip) query.ip = params.ip
    if (params.status) query.status = params.status
    if (params.operation) query.operation = params.operation
    if (params.module) query.module = params.module
    if (params.type) query.type = params.type
    if (params.operator) query.operator = params.operator
    if (params.startTime && params.endTime) {
      query.create_time = { 
        $gte: new Date(params.startTime), 
        $lte: new Date(params.endTime) 
      }
    }
    return query
}
}

module.exports = LogService