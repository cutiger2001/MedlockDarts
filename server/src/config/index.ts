import dotenv from 'dotenv';
import path from 'path';

// In production (compiled), __dirname is server/dist/config/
// .env lives at the project root (two levels up from dist/config)
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const isProd = (process.env.NODE_ENV || 'development') === 'production';

const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  db: {
    server: process.env.DB_SERVER || 'localhost',
    port: parseInt(process.env.DB_PORT || '1433', 10),
    user: process.env.DB_USER || 'DartsAdmin',
    password: process.env.DB_PASSWORD || '180Allday!',
    database: process.env.DB_NAME || 'DartsLeague',
    instanceName: process.env.DB_INSTANCE || '',
  },
  cors: {
    // In production, client is served from the same origin
    origin: isProd ? '*' : (process.env.CLIENT_URL || 'http://localhost:5173'),
  },
} as const;

export default config;
