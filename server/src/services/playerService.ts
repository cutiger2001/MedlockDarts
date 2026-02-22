import { getPool, sql } from '../config/database';
import { Player, CreatePlayerInput } from '../types';

export const playerService = {
  async getAll(): Promise<Player[]> {
    const pool = await getPool();
    const result = await pool.request().query(
      'SELECT * FROM Players WHERE IsActive = 1 ORDER BY LastName, FirstName'
    );
    return result.recordset;
  },

  async getById(id: number): Promise<Player | null> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query('SELECT * FROM Players WHERE PlayerID = @id');
    return result.recordset[0] || null;
  },

  async create(input: CreatePlayerInput): Promise<Player> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('FirstName', sql.NVarChar(100), input.FirstName)
      .input('LastName', sql.NVarChar(100), input.LastName)
      .input('Nickname', sql.NVarChar(100), input.Nickname || null)
      .input('ImageData', sql.NVarChar(sql.MAX), input.ImageData || null)
      .query(`
        INSERT INTO Players (FirstName, LastName, Nickname, ImageData)
        OUTPUT INSERTED.*
        VALUES (@FirstName, @LastName, @Nickname, @ImageData)
      `);
    return result.recordset[0];
  },

  async update(id: number, input: Partial<CreatePlayerInput>): Promise<Player | null> {
    const pool = await getPool();
    const sets: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (input.FirstName !== undefined) {
      sets.push('FirstName = @FirstName');
      request.input('FirstName', sql.NVarChar(100), input.FirstName);
    }
    if (input.LastName !== undefined) {
      sets.push('LastName = @LastName');
      request.input('LastName', sql.NVarChar(100), input.LastName);
    }
    if (input.Nickname !== undefined) {
      sets.push('Nickname = @Nickname');
      request.input('Nickname', sql.NVarChar(100), input.Nickname);
    }
    if (input.ImageData !== undefined) {
      sets.push('ImageData = @ImageData');
      request.input('ImageData', sql.NVarChar(sql.MAX), input.ImageData);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push('UpdatedAt = SYSUTCDATETIME()');
    const result = await request.query(`
      UPDATE Players SET ${sets.join(', ')}
      OUTPUT INSERTED.*
      WHERE PlayerID = @id
    `);
    return result.recordset[0] || null;
  },

  async deactivate(id: number): Promise<boolean> {
    const pool = await getPool();
    const result = await pool
      .request()
      .input('id', sql.Int, id)
      .query('UPDATE Players SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE PlayerID = @id');
    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
