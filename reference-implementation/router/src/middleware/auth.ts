import { Request, Response, NextFunction } from 'express';
import { expressjwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';
import { config } from '../config/config';
import logger from '../utils/logger';
import { AuthenticatedRequest } from '../types';
import { TLSSocket } from 'tls';

/**
 * mTLS Authentication Middleware
 * Verifies client certificate from mutual TLS connection
 */
export function mtlsAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.tls.mtlsEnabled) {
    logger.debug('mTLS authentication disabled');
    return next();
  }

  const socket = req.socket as TLSSocket;

  if (!socket.authorized) {
    logger.warn('Unauthorized mTLS connection', {
      error: socket.authorizationError,
      ip: req.ip,
    });
    res.status(401).json({
      error: 'unauthorized',
      message: 'Client certificate verification failed',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const cert = socket.getPeerCertificate();

  if (!cert || Object.keys(cert).length === 0) {
    logger.warn('No client certificate provided');
    res.status(401).json({
      error: 'unauthorized',
      message: 'Client certificate required',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Extract BIC from certificate CN or SAN
  const bic = extractBICFromCertificate(cert);
  if (!bic) {
    logger.warn('Could not extract BIC from certificate', {
      subject: cert.subject,
    });
    res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid certificate: BIC not found',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Attach certificate info to request
  const authReq = req as AuthenticatedRequest;
  authReq.certificate = {
    subject: cert.subject.CN || '',
    issuer: cert.issuer.CN || '',
    fingerprint: cert.fingerprint,
    validFrom: new Date(cert.valid_from),
    validTo: new Date(cert.valid_to),
  };

  if (!authReq.user) {
    authReq.user = {
      bic,
      clientId: bic,
      scopes: [],
    };
  } else {
    authReq.user.bic = bic;
  }

  logger.debug('mTLS authentication successful', {
    bic,
    fingerprint: cert.fingerprint,
  });

  next();
}

/**
 * Extract BIC from certificate
 * Assumes BIC is in CN like "BIC=PBUA" or in subjectAltName
 */
function extractBICFromCertificate(cert: any): string | null {
  // Try to extract from CN
  const cn = cert.subject?.CN;
  if (cn) {
    const match = cn.match(/BIC=([A-Z0-9]{4,11})/i);
    if (match) {
      return match[1].toUpperCase();
    }

    // If CN is directly a BIC (4-11 uppercase alphanumeric)
    if (/^[A-Z0-9]{4,11}$/.test(cn)) {
      return cn.toUpperCase();
    }
  }

  // Try to extract from OU (Organizational Unit)
  const ou = cert.subject?.OU;
  if (ou && /^[A-Z0-9]{4,11}$/.test(ou)) {
    return ou.toUpperCase();
  }

  return null;
}

/**
 * OAuth 2.0 JWT Authentication Middleware
 * Verifies JWT access token
 */
export const jwtAuth = expressjwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 10,
    jwksUri: config.oauth.jwksUri,
  }) as any,
  issuer: config.oauth.issuer,
  audience: config.oauth.audience,
  algorithms: ['RS256'],
  requestProperty: 'auth',
});

/**
 * Combined authentication middleware
 * Checks both mTLS and OAuth 2.0
 */
export function combinedAuth(req: Request, res: Response, next: NextFunction): void {
  // First check mTLS
  mtlsAuth(req, res, (mtlsError) => {
    if (mtlsError) {
      return;
    }

    // Then check JWT
    jwtAuth(req, res, (jwtError) => {
      if (jwtError) {
        logger.warn('JWT authentication failed', {
          error: jwtError.message,
          ip: req.ip,
        });
        res.status(401).json({
          error: 'unauthorized',
          message: 'Invalid or missing access token',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Merge auth info into user
      const authReq = req as any;
      if (authReq.auth) {
        if (!authReq.user) {
          authReq.user = {};
        }
        authReq.user.clientId = authReq.auth.sub;
        authReq.user.scopes = authReq.auth.scope?.split(' ') || [];
      }

      logger.debug('Combined authentication successful', {
        bic: authReq.user?.bic,
        clientId: authReq.user?.clientId,
      });

      next();
    });
  });
}

/**
 * Require specific scope
 */
export function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user?.scopes.includes(scope)) {
      logger.warn('Insufficient scope', {
        requiredScope: scope,
        userScopes: authReq.user?.scopes,
        bic: authReq.user?.bic,
      });
      res.status(403).json({
        error: 'insufficient_scope',
        message: `Required scope: ${scope}`,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    next();
  };
}
