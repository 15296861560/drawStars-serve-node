/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-04-09 15:40:51
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2024-03-25 23:07:11
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStars-serve-node\config\publish-config.js
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */

const path = require('path');

// 本地调试配置
const dev_config = {
    mysql: {
        host: 'localhost',
        port: 3306,
        user: 'drawStars',
        password: 'Admin_123',
        database: 'draw_stars',
    },
    redis_port: 6379,
    serve_port: 8011, //8010 发布端口,8011本地测试端口
    ws_port: 8021, //8020、8021
    notify_port: 8031, //8030、8031、8032
    uploadDir: path.join(__dirname, '../uploadDir'), // 上传文件路径
}


// 发布配置
const release_config = {
    mysql: {
        host: 'localhost',
        port: 3306,
        user: 'drawStars',
        password: 'Admin_123',
        database: 'draw_stars',
    },
    redis_port: 6379,
    serve_port: 8010, //8010 发布端口,8011本地测试端口
    ws_port: 8020, //8020、8021
    notify_port: 8030, //8030、8031、8032
}
module.exports = process.env.NODE_ENV === 'production' ? release_config : dev_config