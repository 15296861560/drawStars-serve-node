import axios from 'axios'
import Log from '../../provider/log'

const REQUEST = 'request'
const DEFAULT_TIMEOUT = 1000 * 60 * 2

axios.defaults.timeout = DEFAULT_TIMEOUT

axios.interceptors.request.use(config => config)

axios.interceptors.response.use(
  response => response,
  err => {
    const content = {
      type: REQUEST,
      result: err
    }
    Log.addLog(Log.LOG_TYPE.OPERATE, REQUEST, REQUEST, content)
    console.log('showError:', err)
    return Promise.reject(err)
  }
)
