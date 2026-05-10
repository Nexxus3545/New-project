const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { query } = require('../config/database');

const backupDir = path.resolve(process.cwd(), process.env.BACKUP_DIR || 'backups');

const run = (cmd) =>
  new Promise((resolve, reject) => {
    exec(
      cmd,
      { env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD } },
      (error, stdout, stderr) => {
      if (error) return reject(new Error(stderr || error.message));
      resolve(stdout);
      }
    );
  });

const createBackup = async (req, res, next) => {
  try {
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `mwos-backup-${timestamp}.sql`;
    const filePath = path.join(backupDir, fileName);

    const command = `pg_dump -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -f "${filePath}"`;
    await run(command);

    await query(
      'INSERT INTO backup_logs (initiated_by, backup_file, status, notes) VALUES ($1, $2, $3, $4)',
      [req.user.id, filePath, 'success', 'Backup created via API']
    );

    res.json({ success: true, message: 'Backup created', data: { filePath } });
  } catch (err) {
    await query(
      'INSERT INTO backup_logs (initiated_by, backup_file, status, notes) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'n/a', 'failed', err.message]
    ).catch(() => {});
    next(err);
  }
};

const restoreBackup = async (req, res, next) => {
  try {
    const { filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, message: 'filePath is required' });
    }

    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(backupDir)) {
      return res.status(400).json({ success: false, message: 'Restore file must be in backup directory' });
    }

    if (!fs.existsSync(resolved)) {
      return res.status(404).json({ success: false, message: 'Backup file not found' });
    }

    const command = `psql -h ${process.env.DB_HOST} -p ${process.env.DB_PORT} -U ${process.env.DB_USER} -d ${process.env.DB_NAME} -f "${resolved}"`;
    await run(command);

    await query(
      'INSERT INTO backup_logs (initiated_by, backup_file, status, notes) VALUES ($1, $2, $3, $4)',
      [req.user.id, resolved, 'success', 'Restore executed via API']
    );

    res.json({ success: true, message: 'Restore completed', data: { filePath: resolved } });
  } catch (err) {
    await query(
      'INSERT INTO backup_logs (initiated_by, backup_file, status, notes) VALUES ($1, $2, $3, $4)',
      [req.user.id, req.body?.filePath || 'n/a', 'failed', err.message]
    ).catch(() => {});
    next(err);
  }
};

const getBackupLogs = async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM backup_logs ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    next(err);
  }
};

module.exports = { createBackup, restoreBackup, getBackupLogs };
