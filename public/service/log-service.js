const LoginLog = require('../provider/log/login-log')
const OperationLog = require('../provider/log/operation-log')
const BusinessLog = require('../provider/log/business-log')
const excel = require('exceljs')

// 格式化日期为MySQL兼容格式的辅助函数
const formatMySQLDateTime = (date) => {
  if (!date) return null
  const d = date instanceof Date ? date : new Date(date)
  return d.toISOString().replace('T', ' ').substring(0, 19)
}

class LogService {
  // 添加记录登录日志方法
  static async addLoginLog(username, ip, status, userAgent = '', details = '') {
    try {
      // 解析用户代理获取浏览器和操作系统信息
      let browser = '';
      let os = '';
      
      if (userAgent) {
        // 简单解析用户代理字符串
        if (userAgent.includes('Firefox')) {
          browser = 'Firefox';
        } else if (userAgent.includes('Chrome')) {
          browser = 'Chrome';
        } else if (userAgent.includes('Safari')) {
          browser = 'Safari';
        } else if (userAgent.includes('Edge')) {
          browser = 'Edge';
        } else if (userAgent.includes('MSIE') || userAgent.includes('Trident')) {
          browser = 'Internet Explorer';
        } else {
          browser = '未知';
        }
        
        if (userAgent.includes('Windows')) {
          os = 'Windows';
        } else if (userAgent.includes('Mac OS')) {
          os = 'MacOS';
        } else if (userAgent.includes('Linux')) {
          os = 'Linux';
        } else if (userAgent.includes('Android')) {
          os = 'Android';
        } else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
          os = 'iOS';
        } else {
          os = '未知';
        }
      }
      
      // 获取地理位置信息 - 这里使用简单的IP分析
      let location = '';
      if (ip) {
        if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip === '127.0.0.1') {
          location = '内网IP';
        } else {
          // 这里可以接入IP地址库或API进行更精确的地理位置解析
          // 目前只做简单分类
          location = '外网IP';
        }
      }
      
      return await LoginLog.create({
        username,
        ip,
        location,
        browser,
        os,
        status,
        details
      });
    } catch (error) {
      console.error('添加登录日志失败:', error);
      throw error;
    }
  }

  // 查询登录日志
  static async getLoginLogs({ username, ip, status, startTime, endTime, page = 1, pageSize = 10 }) {
    const query = {}
    if (username) query.username = username
    if (ip) query.ip = ip
    if (status) query.status = status
    if (startTime && endTime) {
      query.create_time = { 
        $gte: formatMySQLDateTime(startTime), 
        $lte: formatMySQLDateTime(endTime) 
      }
    }

    const [logs, total] = await Promise.all([
      LoginLog.find({
        ...query,
        sort: { create_time: -1 },
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
      query.create_time = { 
        $gte: formatMySQLDateTime(startTime), 
        $lte: formatMySQLDateTime(endTime) 
      }
    }

    const [logs, total] = await Promise.all([
      OperationLog.find({
        ...query,
        sort: { create_time: -1 },
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
    if (operator) query.operator = operator
    if (startTime && endTime) {
      query.create_time = { 
        $gte: formatMySQLDateTime(startTime), 
        $lte: formatMySQLDateTime(endTime) 
      }
    }

    const [logs, total] = await Promise.all([
      BusinessLog.find({
        ...query,
        sort: { create_time: -1 },
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
      create_time: { 
        $gte: formatMySQLDateTime(startTime), 
        $lte: formatMySQLDateTime(endTime) 
      }
    } : {}

    // 获取基础统计数据
    const [loginCount, operationCount, errorLoginCount, errorOperationCount] = await Promise.all([
      LoginLog.countDocuments(timeCondition),
      OperationLog.countDocuments(timeCondition),
      LoginLog.countDocuments({ ...timeCondition, status: 'fail' }),
      OperationLog.countDocuments({ ...timeCondition, status: 'fail' })
    ])

    // 获取24小时登录数据
    const hours = Array.from({ length: 24 }, (_, i) => i)
    const loginHourData = await Promise.all(hours.map(async hour => {
      const hourStart = new Date(startTime)
      hourStart.setHours(hour, 0, 0, 0)
      const hourEnd = new Date(hourStart)
      hourEnd.setHours(hour, 59, 59, 999)
      
      const formattedStart = formatMySQLDateTime(hourStart)
      const formattedEnd = formatMySQLDateTime(hourEnd)
      
      const [success, fail] = await Promise.all([
        LoginLog.countDocuments({ 
          create_time: { $gte: formattedStart, $lte: formattedEnd },
          status: 'success'
        }),
        LoginLog.countDocuments({ 
          create_time: { $gte: formattedStart, $lte: formattedEnd },
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
        filename = `login_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
        break
      case 'operation':
        logs = await OperationLog.find(this.buildQuery(params))
        filename = `operation_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
        break
      case 'business':
        logs = await BusinessLog.find(this.buildQuery(params))
        filename = `business_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.xlsx`
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
        $gte: formatMySQLDateTime(params.startTime),
        $lte: formatMySQLDateTime(params.endTime)
      }
    }
    return query
  }

  // 添加记录操作日志方法
  static async addOperationLog(username, operation, method, params, ip, status = 'success', error_msg = '') {
    try {
      return await OperationLog.create({
        username,
        operation,
        method,
        params,
        ip,
        status,
        error_msg
      });
    } catch (error) {
      console.error('添加操作日志失败:', error);
      throw error;
    }
  }

  // 添加记录业务日志方法
  static async addBusinessLog(module, type, title, content, operator) {
    try {
      return await BusinessLog.create({
        module,
        type,
        title,
        content,
        operator
      });
    } catch (error) {
      console.error('添加业务日志失败:', error);
      throw error;
    }
  }
}

module.exports = LogService