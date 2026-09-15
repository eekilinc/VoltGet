import pino from 'pino';
import { redactSecrets } from '../security/secrets.js';

const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

const logger = pino({
  hooks: {
    logMethod(args, method) {
      method.apply(this, args.map(value => redactSecrets(value)) as typeof args);
    },
  },
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

const log = {
  fatal: (msg: string, meta?: Record<string, any>) => logger.fatal(meta, msg),
  error: (msg: string, meta?: Record<string, any>) => logger.error(meta, msg),
  warn: (msg: string, meta?: Record<string, any>) => logger.warn(meta, msg),
  info: (msg: string, meta?: Record<string, any>) => logger.info(meta, msg),
  debug: (msg: string, meta?: Record<string, any>) => logger.debug(meta, msg),
  trace: (msg: string, meta?: Record<string, any>) => logger.trace(meta, msg),
  child: (meta: Record<string, any>) => {
    const childLogger = logger.child(meta);
    return {
      fatal: (msg: string, meta?: Record<string, any>) => childLogger.fatal(meta, msg),
      error: (msg: string, meta?: Record<string, any>) => childLogger.error(meta, msg),
      warn: (msg: string, meta?: Record<string, any>) => childLogger.warn(meta, msg),
      info: (msg: string, meta?: Record<string, any>) => childLogger.info(meta, msg),
      debug: (msg: string, meta?: Record<string, any>) => childLogger.debug(meta, msg),
      trace: (msg: string, meta?: Record<string, any>) => childLogger.trace(meta, msg),
    };
  },
};

export default log;
