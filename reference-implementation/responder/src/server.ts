/**
 * VoP Responder Server
 * Handles VoP verification requests for a bank
 */

import express, { Request, Response } from 'express';
import https from 'https';
import fs from 'fs';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

// Import name matcher from reference implementation
// In production, install as npm package: @vop/name-matcher
import { NameMatcher } from '../../name-matching/src/python/name_matcher';

const app = express();
const PORT = parseInt(process.env.PORT || '8443');
const HOST = process.env.HOST || '0.0.0.0';
const RESPONDER_BIC = process.env.RESPONDER_BIC || 'PBUA';

// Middleware
app.use(helmet());
app.use(express.json({ limit: '10kb' }));

// Initialize name matcher
const nameMatcher = new NameMatcher({
  matchThreshold: parseFloat(process.env.MATCH_THRESHOLD || '95.0'),
  closeMatchThreshold: parseFloat(process.env.CLOSE_MATCH_THRESHOLD || '75.0'),
});

// Mock CBS database (in production, connect to real CBS)
const mockAccounts = new Map([
  [
    'UA213052990000026007233566001',
    {
      iban: 'UA213052990000026007233566001',
      accountHolder: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
      accountType: 'PERSONAL' as const,
      status: 'ACTIVE' as const,
    },
  ],
  [
    'UA353052990000026001234567890',
    {
      iban: 'UA353052990000026001234567890',
      accountHolder: 'ТОВ ПРИКЛАД КОМПАНІЯ',
      accountType: 'BUSINESS' as const,
      status: 'ACTIVE' as const,
    },
  ],
]);

// Types
interface VopRequest {
  requestId: string;
  requester: { bic: string };
  payee: {
    iban: string;
    name: string;
    accountType?: 'PERSONAL' | 'BUSINESS';
  };
  timestamp: string;
}

interface VopResponse {
  requestId: string;
  matchStatus: 'MATCH' | 'CLOSE_MATCH' | 'NO_MATCH' | 'ERROR';
  matchScore?: number;
  verifiedName?: string;
  accountType?: 'PERSONAL' | 'BUSINESS';
  accountStatus?: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'BLOCKED';
  reasonCode: string;
  reasonDescription?: string;
  responder: { bic: string };
  timestamp: string;
}

// VoP Verification Endpoint
app.post('/vop/verify', async (req: Request, res: Response) => {
  const request: VopRequest = req.body;

  console.log('Received VoP request:', {
    requestId: request.requestId,
    iban: request.payee.iban,
    requesterBIC: request.requester.bic,
  });

  try {
    // Step 1: Find account in CBS by IBAN
    const account = await findAccountByIban(request.payee.iban);

    if (!account) {
      // Account not found
      const response: VopResponse = {
        requestId: request.requestId,
        matchStatus: 'NO_MATCH',
        reasonCode: 'ACNF',
        reasonDescription: 'Account not found',
        responder: { bic: RESPONDER_BIC },
        timestamp: new Date().toISOString(),
      };

      console.log('Account not found:', request.payee.iban);
      return res.json(response);
    }

    // Step 2: Perform name matching
    const matchResult = nameMatcher.match(
      request.payee.name,
      account.accountHolder
    );

    // Step 3: Determine match status based on score
    let matchStatus: 'MATCH' | 'CLOSE_MATCH' | 'NO_MATCH';
    let reasonCode: string;

    if (matchResult.score >= nameMatcher.matchThreshold) {
      matchStatus = 'MATCH';
      reasonCode = 'ANNM'; // Account Name Match
    } else if (matchResult.score >= nameMatcher.closeMatchThreshold) {
      matchStatus = 'CLOSE_MATCH';
      reasonCode = 'MBAM'; // Match But Additional Match
    } else {
      matchStatus = 'NO_MATCH';
      reasonCode = 'PANM'; // Partial Account Name Match
    }

    // Step 4: Build response
    const response: VopResponse = {
      requestId: request.requestId,
      matchStatus,
      matchScore: Math.round(matchResult.score),
      verifiedName: account.accountHolder,
      accountType: account.accountType,
      accountStatus: account.status,
      reasonCode,
      responder: { bic: RESPONDER_BIC },
      timestamp: new Date().toISOString(),
    };

    console.log('VoP verification result:', {
      requestId: request.requestId,
      matchStatus,
      matchScore: matchResult.score,
    });

    res.json(response);
  } catch (error) {
    console.error('Error processing VoP request:', error);

    const errorResponse: VopResponse = {
      requestId: request.requestId,
      matchStatus: 'ERROR',
      reasonCode: 'TECH',
      reasonDescription: 'Technical error processing request',
      responder: { bic: RESPONDER_BIC },
      timestamp: new Date().toISOString(),
    };

    res.status(500).json(errorResponse);
  }
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    bic: RESPONDER_BIC,
  });
});

// Metrics endpoint (basic)
app.get('/metrics', (req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain');
  res.send('# VoP Responder Metrics\n# TODO: Implement Prometheus metrics\n');
});

// Helper function to find account (in production, query CBS database)
async function findAccountByIban(iban: string): Promise<{
  iban: string;
  accountHolder: string;
  accountType: 'PERSONAL' | 'BUSINESS';
  status: 'ACTIVE' | 'INACTIVE' | 'CLOSED' | 'BLOCKED';
} | null> {
  // In production, query Core Banking System:
  /*
  const sql = `
    SELECT
      cust.customer_name,
      acc.account_type,
      acc.account_status
    FROM accounts acc
    JOIN customers cust ON acc.customer_id = cust.customer_id
    WHERE acc.iban = :iban
  `;
  const result = await db.query(sql, { iban });
  */

  // Mock implementation
  return mockAccounts.get(iban) || null;
}

// Create HTTPS server with mTLS
const tlsOptions: https.ServerOptions = {
  cert: fs.readFileSync(process.env.TLS_CERT || '/certs/server.crt'),
  key: fs.readFileSync(process.env.TLS_KEY || '/certs/server.key'),
  ca: fs.readFileSync(process.env.TLS_CA || '/certs/ca.crt'),
  requestCert: true,
  rejectUnauthorized: true,
  minVersion: 'TLSv1.2',
};

const server = https.createServer(tlsOptions, app);

server.listen(PORT, HOST, () => {
  console.log(`VoP Responder started`);
  console.log(`  URL: https://${HOST}:${PORT}`);
  console.log(`  BIC: ${RESPONDER_BIC}`);
  console.log(`  mTLS: enabled`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
