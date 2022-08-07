/*
 * @Description: 
 * @Version: 2.0
 * @Autor: lgy
 * @Date: 2022-07-27 22:44:24
 * @LastEditors: lgy
 * @LastEditTime: 2022-08-07 16:12:58
 */
let crypto = require('crypto');
let randomInt = Math.floor(Math.random() * 0xFFFFFFFF);
let algorithm = 'aes-128-cbc';
let clearEncoding = 'utf8';
let iv = "123abfjsout45678";

let AccessToken = function (appID, appCertificate, uid = 0, expireTime = 24 * 60 * 60 * 1000, level = 0) {
    let token = this;
    this.appID = appID;
    this.appCertificate = appCertificate; //长度为16
    this.salt = randomInt;
    this.createTime = new Date().getTime();
    this.expireTimestamp = this.createTime + expireTime;
    this.level = level;
    if (uid === 0) {
        this.uid = "";
    } else {
        this.uid = `${uid}`;
    }

    this.build = function (uid) {
        this.uid = uid;
        return this.encryption(JSON.stringify(token));
    }
    /**
     * @description: 加密
     * @param {*} data
     * @return {*}base64
     * @author: lgy
     */
    this.encryption = function (data) {
        let key = this.appCertificate;

        let cipherChunks = [];
        let cipher = crypto.createCipheriv(algorithm, key, iv);

        cipher.setAutoPadding(true);
        cipherChunks.push(cipher.update(data, clearEncoding, 'base64'));
        cipherChunks.push(cipher.final('base64'));
        return cipherChunks.join('');
    }

    /**
     * @description: 解密
     * @return {*}utf8
     * @author: lgy
     */
    this.decryption = function (data) {
        let key = this.appCertificate;

        let cipherChunks = [];

        let decipher = crypto.createDecipheriv(algorithm, key, iv);

        decipher.setAutoPadding(true);
        cipherChunks.push(decipher.update(data, 'base64', clearEncoding));
        cipherChunks.push(decipher.final(clearEncoding));
        return cipherChunks.join('');

    }

};

module.exports.AccessToken = AccessToken;