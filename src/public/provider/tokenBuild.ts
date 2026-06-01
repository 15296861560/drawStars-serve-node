import crypto from "crypto";

const algorithm = "aes-128-cbc";
const clearEncoding = "utf8";
const iv = "123abfjsout45678";

export class AccessToken {
  appID: string;
  appCertificate: string;
  salt: number;
  createTime: number;
  expireTimestamp: number;
  level: number;
  uid: string;

  constructor(
    appID: string,
    appCertificate: string,
    uid: string | number = 0,
    expireTime = 24 * 60 * 60 * 1000,
    level = 0,
  ) {
    this.appID = appID;
    this.appCertificate = appCertificate;
    this.salt = Math.floor(Math.random() * 0xffffffff);
    this.createTime = new Date().getTime();
    this.expireTimestamp = this.createTime + expireTime;
    this.level = level;
    this.uid = uid === 0 ? "" : `${uid}`;
  }

  build(uid: string | number): string {
    this.uid = `${uid}`;
    this.createTime = new Date().getTime();
    this.expireTimestamp = this.createTime + 24 * 60 * 60 * 1000;
    return this.encryption(JSON.stringify(this));
  }

  encryption(data: string): string {
    const cipher = crypto.createCipheriv(
      algorithm,
      this.appCertificate,
      iv,
    );
    cipher.setAutoPadding(true);
    const chunks = [
      cipher.update(data, clearEncoding, "base64"),
      cipher.final("base64"),
    ];
    return chunks.join("");
  }

  decryption(data: string): string {
    const decipher = crypto.createDecipheriv(
      algorithm,
      this.appCertificate,
      iv,
    );
    decipher.setAutoPadding(true);
    const chunks = [
      decipher.update(data, "base64", clearEncoding),
      decipher.final(clearEncoding),
    ];
    return chunks.join("");
  }
}
