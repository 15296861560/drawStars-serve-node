/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-10-28 23:36:35
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-04-09 15:51:58
 */
const WebSocket = require('ws')
const config = require('../../config/publish-config')
const port = config['ws_port'] 

const ws = new WebSocket.Server({
    port
}, () => {
    console.log(`websocket run port ${port}`)
})


//每当有客户端链接的时候 就会有一个client对象
ws.on('connection', (client) => {
    //主动向前端发送消息
    client.send('连接WebSocket成功') //数据只能传输字符串
    client.on('message', (msg) => {
        console.log('来自前端的数据：' + msg)
        client.send('服务端发送的信息：' + new Date().toLocaleString())
    })

    client.on('close', (msg) => {
        console.log('前端主动断开了链接：')
    })
})

module.exports = ws;