const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../database/tiss_school.db');
const schemaPath = path.resolve(__dirname, '../database/schema.sql');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Failed to connect to SQLite database:', err.message);
    } else {
        console.log('Connected to SQLite database at:', dbPath);
    }
});

// Enable Foreign Keys & WAL mode
db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON;');
    db.run('PRAGMA journal_mode = WAL;');
});

// Utility wrappers for async / await
const query = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const get = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const run = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

const initSchema = async () => {
    try {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        const statements = schema
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        for (const statement of statements) {
            await run(statement);
        }
        console.log('Database schema initialized successfully.');
    } catch (err) {
        console.error('Error initializing database schema:', err.message);
    }
};

module.exports = {
    db,
    query,
    get,
    run,
    initSchema
};
