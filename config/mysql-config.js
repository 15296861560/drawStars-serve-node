const mysql = require('mysql')

const connectdb = () => {
  let connection = mysql.createConnection({
    host: 'localhost',
    port: '3306',
    user: 'drawStars',
    password: 'Admin_123',
    database: 'draw_stars'
  })
  return connection;
}

module.exports = connectdb;
