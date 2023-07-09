/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-05-23 23:24:07
 * @LastEditors: “lgy lgy-lgy@qq.com
 * @LastEditTime: 2023-07-09 23:26:46
 */
const axios = require('axios');
const Log = require("../../provider/log");
const REQUEST = 'request';
const DEFAULT_TIMEOUT = 1000 * 60 * 2;


axios.defaults.timeout = DEFAULT_TIMEOUT;
axios.interceptors.request.use(
    config => {
        return config
    }
)
axios.interceptors.response.use(
    response => {
        return response
    },
    err => {
        showError(errObj);
        return Promise.reject(err)
    }
)

const showError = function (errorMessage) {
    const content = {
        type: REQUEST,
        result: errorMessage
    };
    Log.addLog(Log.LOG_TYPE.OPERATE, REQUEST, REQUEST, content);
    console.log('showError:', errorMessage);
}