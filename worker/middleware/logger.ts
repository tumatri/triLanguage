export const getLogger = () => ({
  info: (msg: string, meta?: Record<string, unknown>) => {
    if (meta) {
      console.info(`[info] ${msg}`, JSON.stringify(meta));
    } else {
      console.info(`[info] ${msg}`);
    }
  },
  warn: (msg: string, meta?: Record<string, unknown>) => {
    if (meta) {
      console.warn(`[warn] ${msg}`, JSON.stringify(meta));
    } else {
      console.warn(`[warn] ${msg}`);
    }
  },
  error: (msg: string, meta?: Record<string, unknown>) => {
    if (meta) {
      console.error(`[error] ${msg}`, JSON.stringify(meta));
    } else {
      console.error(`[error] ${msg}`);
    }
  }
});

const log = getLogger();
export default log;
