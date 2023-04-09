const mysql = require('mysql')
const config = require('./publish-config')

const connectdb = () => {
  let connection = mysql.createConnection({
    host: 'localhost',
    port: config['mysql_port'],
    user: 'drawStars',
    password: 'Admin_123',
    database: 'draw_stars'
  })
  return connection;
}

module.exports = connectdb;