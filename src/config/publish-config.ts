import path from "path";

export interface MysqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface AppConfig {
  mysql: MysqlConfig;
  redis_port: number;
  serve_port: number;
  ws_port: number;
  notify_port: number;
  uploadDir?: string;
}

const dev_config: AppConfig = {
  mysql: {
    host: "localhost",
    port: 3306,
    user: "drawStars",
    password: "Admin_123",
    database: "draw_stars",
  },
  redis_port: 6379,
  serve_port: 8011,
  ws_port: 8021,
  notify_port: 8031,
  uploadDir: path.join(__dirname, "../../uploadDir"),
};

const release_config: AppConfig = {
  mysql: {
    host: "localhost",
    port: 3306,
    user: "drawStars",
    password: "Admin_123",
    database: "draw_stars",
  },
  redis_port: 6379,
  serve_port: 8010,
  ws_port: 8020,
  notify_port: 8030,
  uploadDir: path.join(__dirname, "../../uploadDir"),
};

const config: AppConfig =
  process.env.NODE_ENV === "production" ? release_config : dev_config;

export function buildDatabaseUrl(mysql: MysqlConfig): string {
  const encodedPassword = encodeURIComponent(mysql.password);
  return `mysql://${mysql.user}:${encodedPassword}@${mysql.host}:${mysql.port}/${mysql.database}`;
}

export default config;
