import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { CrawlSession, Connection, Company, CompanyConnection } from '@/types';

class DatabaseManager {
  private db: Database.Database;

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    const dbPath = path.join(dataDir, 'linkedin-networker.db');
    
    // Ensure data directory exists
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    this.db = new Database(dbPath);
    this.initTables();
  }

  private initTables() {
    // Run migrations first
    this.runMigrations();
    
    // Create crawl_sessions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_sessions (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('first_connections', 'friends_of_friends')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'completed', 'failed')),
        progress INTEGER DEFAULT 0,
        total_connections INTEGER,
        processed_connections INTEGER DEFAULT 0,
        error TEXT
      )
    `);

    // Create connections table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS connections (
        id TEXT PRIMARY KEY,
        crawl_session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        headline TEXT,
        profile_url TEXT NOT NULL,
        profile_image_url TEXT,
        connection_source TEXT,
        company TEXT,
        company_url TEXT,
        company_logo_url TEXT,
        connection_degree INTEGER NOT NULL CHECK(connection_degree IN (1, 2)),
        mutual_connection TEXT,
        location TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (crawl_session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
      )
    `);

    // Create companies table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        linkedin_url TEXT NOT NULL UNIQUE,
        logo_url TEXT,
        description TEXT,
        industry TEXT,
        size TEXT,
        location TEXT,
        website TEXT,
        created_at TEXT NOT NULL
      )
    `);

    // Create company_connections table (junction table)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS company_connections (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL,
        connection_id TEXT NOT NULL,
        crawl_session_id TEXT NOT NULL,
        connection_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
        FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE,
        FOREIGN KEY (crawl_session_id) REFERENCES crawl_sessions(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_connections_session ON connections(crawl_session_id);
      CREATE INDEX IF NOT EXISTS idx_connections_degree ON connections(connection_degree);
      CREATE INDEX IF NOT EXISTS idx_company_connections_session ON company_connections(crawl_session_id);
      CREATE INDEX IF NOT EXISTS idx_company_connections_company ON company_connections(company_id);
    `);
  }

  private runMigrations() {
    // Check if profile_image_url column exists in connections table
    const columnInfo = this.db.prepare(`
      PRAGMA table_info(connections)
    `).all() as Array<{name: string}>;
    const columnExists = columnInfo.some((col) => col.name === 'profile_image_url');

    if (!columnExists) {
      console.log('Adding profile_image_url column to connections table...');
      this.db.exec(`
        ALTER TABLE connections ADD COLUMN profile_image_url TEXT;
      `);
    }

    // Check if connection_source column exists
    const sourceColumnInfo = this.db.prepare(`
      PRAGMA table_info(connections)
    `).all() as Array<{name: string}>;
    const sourceColumnExists = sourceColumnInfo.some((col) => col.name === 'connection_source');

    if (!sourceColumnExists) {
      console.log('Adding connection_source column to connections table...');
      this.db.exec(`
        ALTER TABLE connections ADD COLUMN connection_source TEXT;
      `);
    }
  }

  // Crawl Session methods
  createCrawlSession(session: Omit<CrawlSession, 'id' | 'createdAt'>): string {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO crawl_sessions (id, created_at, mode, status, progress, total_connections, processed_connections, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, createdAt, session.mode, session.status, session.progress, 
             session.totalConnections, session.processedConnections, session.error);
    
    return id;
  }

  getCrawlSession(id: string): CrawlSession | null {
    const stmt = this.db.prepare(`
      SELECT id, created_at as createdAt, mode, status, progress, 
             total_connections as totalConnections, processed_connections as processedConnections, error
      FROM crawl_sessions WHERE id = ?
    `);
    return stmt.get(id) as CrawlSession | null;
  }

  getAllCrawlSessions(): CrawlSession[] {
    const stmt = this.db.prepare(`
      SELECT id, created_at as createdAt, mode, status, progress,
             total_connections as totalConnections, processed_connections as processedConnections, error
      FROM crawl_sessions ORDER BY created_at DESC
    `);
    return stmt.all() as CrawlSession[];
  }

  updateCrawlSession(id: string, updates: Partial<CrawlSession>): void {
    const fields = [];
    const values = [];
    
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }
    if (updates.progress !== undefined) {
      fields.push('progress = ?');
      values.push(updates.progress);
    }
    if (updates.totalConnections !== undefined) {
      fields.push('total_connections = ?');
      values.push(updates.totalConnections);
    }
    if (updates.processedConnections !== undefined) {
      fields.push('processed_connections = ?');
      values.push(updates.processedConnections);
    }
    if (updates.error !== undefined) {
      fields.push('error = ?');
      values.push(updates.error);
    }
    
    if (fields.length > 0) {
      const stmt = this.db.prepare(`UPDATE crawl_sessions SET ${fields.join(', ')} WHERE id = ?`);
      stmt.run(...values, id);
    }
  }

  deleteCrawlSession(id: string): void {
    const stmt = this.db.prepare('DELETE FROM crawl_sessions WHERE id = ?');
    stmt.run(id);
  }

  // Connection methods
  createConnection(connection: Omit<Connection, 'id' | 'createdAt'>): string {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO connections (id, crawl_session_id, name, headline, profile_url, profile_image_url, connection_source, company, company_url,
                              company_logo_url, connection_degree, mutual_connection, location, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, connection.crawlSessionId, connection.name, connection.headline, connection.profileUrl,
             connection.profileImageUrl, connection.connectionSource, connection.company, connection.companyUrl, connection.companyLogoUrl, connection.connectionDegree,
             connection.mutualConnection, connection.location, createdAt);
    
    return id;
  }

  getConnectionsBySession(sessionId: string): Connection[] {
    const stmt = this.db.prepare(`
      SELECT id, crawl_session_id as crawlSessionId, name, headline, profile_url as profileUrl,
             profile_image_url as profileImageUrl, connection_source as connectionSource, company, company_url as companyUrl, company_logo_url as companyLogoUrl,
             connection_degree as connectionDegree, mutual_connection as mutualConnection,
             location, created_at as createdAt
      FROM connections WHERE crawl_session_id = ?
    `);
    return stmt.all(sessionId) as Connection[];
  }

  // Company methods
  createCompany(company: Omit<Company, 'id' | 'createdAt'>): string {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO companies (id, name, linkedin_url, logo_url, description, industry, size, location, website, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, company.name, company.linkedinUrl, company.logoUrl, company.description,
             company.industry, company.size, company.location, company.website, createdAt);
    
    return id;
  }

  getCompanyByLinkedInUrl(linkedinUrl: string): Company | null {
    const stmt = this.db.prepare(`
      SELECT id, name, linkedin_url as linkedinUrl, logo_url as logoUrl, description,
             industry, size, location, website, created_at as createdAt
      FROM companies WHERE linkedin_url = ?
    `);
    return stmt.get(linkedinUrl) as Company | null;
  }

  // Company Connection methods
  createCompanyConnection(companyConnection: Omit<CompanyConnection, 'id' | 'createdAt'>): string {
    const id = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    
    const stmt = this.db.prepare(`
      INSERT INTO company_connections (id, company_id, connection_id, crawl_session_id, connection_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, companyConnection.companyId, companyConnection.connectionId, 
             companyConnection.crawlSessionId, companyConnection.connectionPath, createdAt);
    
    return id;
  }

  getCompanyConnectionsBySession(sessionId: string) {
    const stmt = this.db.prepare(`
      SELECT 
        cc.id, cc.connection_path as connectionPath, cc.created_at as createdAt,
        c.id as companyId, c.name as companyName, c.linkedin_url as companyLinkedInUrl,
        c.logo_url as companyLogoUrl, c.description as companyDescription,
        conn.id as connectionId, conn.name as connectionName, conn.headline as connectionHeadline,
        conn.profile_url as connectionProfileUrl, conn.profile_image_url as connectionProfileImageUrl, 
        conn.connection_source as connectionSource, conn.connection_degree as connectionDegree
      FROM company_connections cc
      JOIN companies c ON cc.company_id = c.id
      JOIN connections conn ON cc.connection_id = conn.id
      WHERE cc.crawl_session_id = ?
      ORDER BY c.name, conn.name
    `);
    return stmt.all(sessionId);
  }

  close() {
    this.db.close();
  }
}

let dbInstance: DatabaseManager | null = null;

export function getDatabase(): DatabaseManager {
  if (!dbInstance) {
    dbInstance = new DatabaseManager();
  }
  return dbInstance;
}

export default DatabaseManager;