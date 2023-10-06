const https = require('https');
const querystring = require('querystring');
const {
	getAppInfo
} = require('../../db/mysql/commom-api');

const apiUrl = 'sms_developer.zhenzikj.com';
const appName = "zhenzi";

class ZhenzismsClient {
	constructor() {
		this.apiUrl = apiUrl;
		this.defaultTemplateId = '12214';
		this.init();
	}

	async init() {
		const appInfo = await getAppInfo(appName);
		if (appInfo && appInfo.app_id && appInfo.app_certificate) {
			this.appId = appInfo.app_id;
			this.appSecret = appInfo.app_certificate;
		}
	}

	//发送短信
	send(data) {
		const options = {
			hostname: this.apiUrl,
			method: 'POST',
			path: '/sms/v2/send.do',
			rejectUnauthorized: false,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		};
		data.appId = this.appId;
		data.appSecret = this.appSecret;
		if (!data.templateId) {
			data.templateId = this.defaultTemplateId;
		}

		if (data.templateParams) {
			data.templateParams = JSON.stringify(data.templateParams);
		}

		return new Promise(function (resolve, reject) {
			const req = https.request(options, (res) => {
				res.setEncoding('utf8');
				res.on('data', (d) => {
					var result = JSON.parse(d);
					resolve(result);
				});

			});
			var content = querystring.stringify(data);
			console.log('send', content);
			req.write(content);
			req.end();
		});
	}
	//查看余额
	balance() {
		const options = {
			hostname: apiUrl,
			method: 'POST',
			path: '/account/balance.do',
			rejectUnauthorized: false,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		};
		var data = {
			appId: this.appId,
			appSecret: this.appSecret
		};
		return new Promise(function (resolve, reject) {
			const req = https.request(options, (res) => {
				res.setEncoding('utf8');
				res.on('data', (d) => {
					var result = JSON.parse(d);
					resolve(result);
				});

			});
			var content = querystring.stringify(data);
			req.write(content);
			req.end();
		});
	}
	//查询单条短信
	findSmsByMessageId(messageId) {
		const options = {
			hostname: apiUrl,
			method: 'POST',
			path: '/smslog/findSmsByMessageId.do',
			rejectUnauthorized: false,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded'
			}
		};
		var data = {
			appId: this.appId,
			appSecret: this.appSecret,
			messageId
		};
		return new Promise(function (resolve, reject) {
			const req = https.request(options, (res) => {
				res.setEncoding('utf8');
				res.on('data', (d) => {
					var result = JSON.parse(d);
					resolve(result);
				});

			});
			var content = querystring.stringify(data);
			console.log('findSmsByMessageId', messageId, content);
			req.write(content);
			req.end();
		});
	}
}


module.exports = new ZhenzismsClient();