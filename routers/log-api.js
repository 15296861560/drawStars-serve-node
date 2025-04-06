const express = require('express')
const router = express.Router()
const LogService = require('../public/service/log-service')

// 日志中间件
router.use((req, res, next) => {
  console.log(`[LogAPI] ${new Date().toISOString()} ${req.method} ${req.path}`)
  next()
})

// 查询登录日志
router.get('/queryLoginLogs', async (req, res) => {
  try {
    const { username, ip, status, timeRange } = req.query
    const data = await LogService.getLoginLogs({ 
      username, 
      ip, 
      status,
      startTime: timeRange?.[0],
      endTime: timeRange?.[1]
    })
    res.json({ status: true, msg: 'success', data })
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message })
  }
})

// 查询操作日志
router.get('/queryOperationLogs', async (req, res) => {
  try {
    const { username, operation, status, timeRange } = req.query
    const data = await LogService.getOperationLogs({
      username,
      operation,
      status,
      startTime: timeRange?.[0],
      endTime: timeRange?.[1]
    })
    res.json({ status: true, msg: 'success', data })
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message })
  }
})

// 查询业务日志
router.get('/queryBusinessLogs', async (req, res) => {
  try {
    const { module, type, operator, timeRange } = req.query
    const data = await LogService.getBusinessLogs({
      module,
      type,
      operator,
      startTime: timeRange?.[0],
      endTime: timeRange?.[1]
    })
    res.json({ status: true, msg: 'success', data })
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message })
  }
})

// 获取日志统计
router.get('/getLogStatistics', async (req, res) => {
  try {
    const { timeRange } = req.query
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    
    // 获取统计数据
    const data = await LogService.getLogStatistics({
      startTime: timeRange?.[0] || new Date(today.setHours(0, 0, 0, 0)),
      endTime: timeRange?.[1] || new Date(today.setHours(23, 59, 59, 999))
    })

    res.json({ 
      status: true, 
      msg: 'success', 
      data: {
        ...data,
        charts: data.charts // 确保包含图表数据
      }
    })
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message })
  }
})

// 删除日志
router.get('/deleteLog', async (req, res) => {
  try {
    const { id } = req.query
    await LogService.deleteLog(id)
    res.json({ status: true, msg: '删除成功' })
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message })
  }
})

// 批量删除日志
router.get('/batchDeleteLogs', async (req, res) => {
  try {
    const { ids } = req.query
    await LogService.batchDeleteLogs(ids.split(','))
    res.json({ status: true, msg: '批量删除成功' })
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message })
  }
})

// 导出日志
router.get('/exportLogs', async (req, res) => {
  try {
    const { type, ...params } = req.query
    const { filename, data } = await LogService.exportLogs(type, params)
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`)
    res.send(data)
  } catch (error) {
    res.status(500).json({ status: false, msg: error.message })
  }
})

module.exports = router