import axios from "axios";
import { getAppInfo } from "../../../db/app-info";
import config from "../../../config/publish-config";

const appName = "github";
const SERVE_PORT = config.serve_port;
const REDIRECT_URI = `http://127.0.0.1:${SERVE_PORT}`;

class GithubProvider {
  appID = "";
  appCertificate = "";

  constructor() {
    this.init();
  }

  async init() {
    const appInfo = await getAppInfo(appName);
    if (appInfo?.app_id && appInfo?.app_certificate) {
      this.appID = appInfo.app_id;
      this.appCertificate = appInfo.app_certificate;
    }
  }

  async getAccessToken(code: string, state: string) {
    const params = {
      client_id: this.appID,
      client_secret: this.appCertificate,
      code,
      redirect_uri: `${REDIRECT_URI}/loginApi/oauthLogin/github`,
      state,
    };
    const res = await axios.post(
      "https://github.com/login/oauth/access_token",
      null,
      {
        params,
        headers: { Accept: "application/json" },
      },
    );
    return res.data.access_token as string;
  }

  async queryGithubUserInfo(accessToken: string) {
    const res = await axios.get(
      `https://api.github.com/user?access_token=${accessToken}`,
      {
        headers: { Authorization: "token " + accessToken },
      },
    );
    return res.data as {
      id: number;
      login: string;
      avatar_url: string;
    };
  }
}

export default new GithubProvider();
