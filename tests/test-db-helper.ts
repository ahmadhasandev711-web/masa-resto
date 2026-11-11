export const isDbAvailable = process.env.TEST_DB_AVAILABLE === 'true';
export const DB_SKIP_REASON = 'Requires live MySQL database (resto_test) on port 3306';
