import sql from 'mssql';
import config from './index';
import { logger } from '../middleware/logger';

const dbConfig: sql.config = {
  server: config.db.server,
  port: config.db.instanceName ? undefined : config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: config.db.instanceName || undefined,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool) {
    pool = await new sql.ConnectionPool(dbConfig).connect();
    logger.info('Connected to MS-SQL Server');
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    logger.info('MS-SQL connection pool closed');
  }
}

export { sql };
