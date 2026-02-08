import { database } from '../config/database';
import { DirectoryEntry } from '../types';
import logger from '../utils/logger';
import { directoryLookupDuration } from '../utils/metrics';
import { Redis } from 'ioredis';
import { config } from '../config/config';

class DirectoryService {
  private redis: Redis;
  private readonly CACHE_TTL = 300; // 5 minutes

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
    });

    this.redis.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });
  }

  /**
   * Find responder bank by IBAN
   */
  async findResponderByIban(iban: string): Promise<DirectoryEntry | null> {
    const timer = directoryLookupDuration.startTimer();

    try {
      // Extract bank code from IBAN (characters 5-10 for Ukrainian IBANs)
      // Format: UA + 2 check digits + 6 bank code (MFO) + account number
      const bankCode = iban.substring(4, 10);
      const ibanPrefix = iban.substring(0, 6); // UA + check + first 2 of MFO

      logger.debug('Looking up responder', { iban, bankCode, ibanPrefix });

      // Try cache first
      const cacheKey = `directory:iban:${ibanPrefix}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        logger.debug('Directory cache hit', { ibanPrefix });
        const entry = JSON.parse(cached);
        timer();
        return entry;
      }

      // Query database
      const bic = await this.findBicByIbanPrefix(ibanPrefix);
      if (!bic) {
        logger.warn('No BIC found for IBAN prefix', { ibanPrefix });
        timer();
        return null;
      }

      const entry = await this.getDirectoryEntry(bic);
      if (entry) {
        // Cache the result
        await this.redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(entry));
      }

      timer();
      return entry;
    } catch (error) {
      timer();
      logger.error('Directory lookup error', {
        iban,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Find BIC by IBAN prefix
   */
  private async findBicByIbanPrefix(ibanPrefix: string): Promise<string | null> {
    const query = `
      SELECT bic
      FROM iban_prefix_mapping
      WHERE iban_prefix = $1
      LIMIT 1
    `;

    const rows = await database.query<{ bic: string }>(query, [ibanPrefix]);
    return rows.length > 0 ? rows[0].bic : null;
  }

  /**
   * Get directory entry by BIC
   */
  async getDirectoryEntry(bic: string): Promise<DirectoryEntry | null> {
    const query = `
      SELECT
        id, bic, bank_name, endpoint_url, status,
        certificate_fingerprint, rate_limit_per_sec,
        created_at, updated_at
      FROM vop_directory
      WHERE bic = $1 AND status = 'ACTIVE'
      LIMIT 1
    `;

    const rows = await database.query<{
      id: number;
      bic: string;
      bank_name: string;
      endpoint_url: string;
      status: string;
      certificate_fingerprint: string | null;
      rate_limit_per_sec: number;
      created_at: Date;
      updated_at: Date;
    }>(query, [bic]);

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      bic: row.bic,
      bankName: row.bank_name,
      endpointUrl: row.endpoint_url,
      status: row.status as 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE',
      certificateFingerprint: row.certificate_fingerprint || undefined,
      rateLimitPerSec: row.rate_limit_per_sec,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Get all active directory entries
   */
  async getAllActiveEntries(): Promise<DirectoryEntry[]> {
    const query = `
      SELECT
        id, bic, bank_name, endpoint_url, status,
        certificate_fingerprint, rate_limit_per_sec,
        created_at, updated_at
      FROM vop_directory
      WHERE status = 'ACTIVE'
      ORDER BY bic
    `;

    const rows = await database.query<{
      id: number;
      bic: string;
      bank_name: string;
      endpoint_url: string;
      status: string;
      certificate_fingerprint: string | null;
      rate_limit_per_sec: number;
      created_at: Date;
      updated_at: Date;
    }>(query);

    return rows.map((row) => ({
      id: row.id,
      bic: row.bic,
      bankName: row.bank_name,
      endpointUrl: row.endpoint_url,
      status: row.status as 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE',
      certificateFingerprint: row.certificate_fingerprint || undefined,
      rateLimitPerSec: row.rate_limit_per_sec,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * Update directory entry status
   */
  async updateStatus(bic: string, status: 'ACTIVE' | 'INACTIVE' | 'MAINTENANCE'): Promise<void> {
    const query = `
      UPDATE vop_directory
      SET status = $1, updated_at = NOW()
      WHERE bic = $2
    `;

    await database.query(query, [status, bic]);
    logger.info('Directory entry status updated', { bic, status });

    // Invalidate cache
    await this.invalidateCache(bic);
  }

  /**
   * Invalidate cache for a BIC
   */
  private async invalidateCache(bic: string): Promise<void> {
    const pattern = `directory:iban:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length > 0) {
      await this.redis.del(...keys);
      logger.debug('Directory cache invalidated', { bic, keysDeleted: keys.length });
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.redis.quit();
    logger.info('Directory service connections closed');
  }
}

export const directoryService = new DirectoryService();
export default directoryService;
