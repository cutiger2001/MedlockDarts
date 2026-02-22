import { getPool, sql } from '../config/database';
import { Team } from '../types';

export interface CreateTeamInput {
  TeamName: string;
  Player1ID: number;
  Player2ID: number;
}

export const teamService = {
  async getAll(): Promise<Team[]> {
    const pool = await getPool();
    const result = await pool.request().query(`
      SELECT t.*,
        p1.FirstName AS Player1FirstName, p1.LastName AS Player1LastName,
        p2.FirstName AS Player2FirstName, p2.LastName AS Player2LastName
      FROM Teams t
      JOIN Players p1 ON t.Player1ID = p1.PlayerID
      JOIN Players p2 ON t.Player2ID = p2.PlayerID
      WHERE t.IsActive = 1
      ORDER BY t.TeamName
    `);
    return result.recordset;
  },

  async getById(id: number): Promise<Team | null> {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`
        SELECT t.*,
          p1.FirstName AS Player1FirstName, p1.LastName AS Player1LastName,
          p2.FirstName AS Player2FirstName, p2.LastName AS Player2LastName
        FROM Teams t
        JOIN Players p1 ON t.Player1ID = p1.PlayerID
        JOIN Players p2 ON t.Player2ID = p2.PlayerID
        WHERE t.TeamID = @id
      `);
    return result.recordset[0] || null;
  },

  async create(input: CreateTeamInput): Promise<Team> {
    const pool = await getPool();
    const result = await pool.request()
      .input('TeamName', sql.NVarChar(200), input.TeamName)
      .input('Player1ID', sql.Int, input.Player1ID)
      .input('Player2ID', sql.Int, input.Player2ID)
      .query(`
        INSERT INTO Teams (TeamName, Player1ID, Player2ID)
        OUTPUT INSERTED.*
        VALUES (@TeamName, @Player1ID, @Player2ID)
      `);
    return result.recordset[0];
  },

  async update(id: number, input: Partial<CreateTeamInput>): Promise<Team | null> {
    const pool = await getPool();
    const sets: string[] = [];
    const request = pool.request().input('id', sql.Int, id);

    if (input.TeamName !== undefined) {
      sets.push('TeamName = @TeamName');
      request.input('TeamName', sql.NVarChar(200), input.TeamName);
    }
    if (input.Player1ID !== undefined) {
      sets.push('Player1ID = @Player1ID');
      request.input('Player1ID', sql.Int, input.Player1ID);
    }
    if (input.Player2ID !== undefined) {
      sets.push('Player2ID = @Player2ID');
      request.input('Player2ID', sql.Int, input.Player2ID);
    }

    if (sets.length === 0) return this.getById(id);

    sets.push('UpdatedAt = SYSUTCDATETIME()');
    await request.query(`UPDATE Teams SET ${sets.join(', ')} WHERE TeamID = @id`);
    return this.getById(id);
  },

  async deactivate(id: number): Promise<boolean> {
    const pool = await getPool();
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('UPDATE Teams SET IsActive = 0, UpdatedAt = SYSUTCDATETIME() WHERE TeamID = @id');
    return (result.rowsAffected[0] ?? 0) > 0;
  },
};
