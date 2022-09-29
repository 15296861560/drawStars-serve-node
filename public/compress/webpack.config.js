/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-09-18 22:16:20
 * @LastEditors: lgy
 * @LastEditTime: 2022-09-29 23:34:01
 */
const path = require('path')
const uglify = require('uglifyjs-webpack-plugin');


module.exports = {
  entry: {
    entry: './src/entry.js'
  },
  output: {
    // 输出路径
    path: path.resolve(__dirname, 'dist'),
    // 输出文件名
    filename: 'bundle.js',
  },
  mode: 'production',
  plugins: [
    // 压缩ES6
    new uglify({
      uglifyOptions: {
        compress: {
          // 内嵌已定义但是只用到一次的变量
          collapse_vars: true,
          // 提取出现了多次但是没有定义成变量去引用的静态值
          reduce_vars: true,
        },
      }
    }),
  ],
  module: {
    rules: [{
      test: /\.js$/,
      exclude: /node_modules/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'] //转es5
        }
      },
    }]
  }
};