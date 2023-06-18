/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2023-04-09 15:40:51
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-04-16 17:11:25
 * @Author: “lgy lgy-lgy@qq.com
 * @FilePath: \drawStars-serve-node\config\publish-config.js
 * 
 * Copyright (c) 2023 by ${git_name_email}, All Rights Reserved. 
 */
module.exports = {
    mysql_port: 3306,
    redis_port: 6379,
    serve_port: 8011, //8010 发布端口,8011本地测试端口
    ws_port: 8021, //8020、8021
    notify_port: 8031, //8030、8031、8032
    // serve_port: 8010, //8010 发布端口,8011本地测试端口
    // ws_port: 8020, //8020、8021
    // notify_port: 8030, //8030、8031、8032
}