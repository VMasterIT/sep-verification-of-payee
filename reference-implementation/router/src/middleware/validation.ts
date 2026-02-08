import { Request, Response, NextFunction } from 'express';
import Ajv, { JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import { VopRequest } from '../types';
import logger from '../utils/logger';

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

/**
 * JSON Schema for VoP Request
 */
const vopRequestSchema: JSONSchemaType<VopRequest> = {
  type: 'object',
  properties: {
    requestId: {
      type: 'string',
      minLength: 1,
      maxLength: 35,
      pattern: '^[A-Za-z0-9\\-]+$',
    },
    requester: {
      type: 'object',
      properties: {
        bic: {
          type: 'string',
          pattern: '^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$',
        },
      },
      required: ['bic'],
    },
    payee: {
      type: 'object',
      properties: {
        iban: {
          type: 'string',
          pattern: '^UA[0-9]{27}$',
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 140,
        },
        accountType: {
          type: 'string',
          enum: ['PERSONAL', 'BUSINESS'],
          nullable: true,
        },
      },
      required: ['iban', 'name'],
    },
    additionalInfo: {
      type: 'object',
      properties: {
        paymentAmount: {
          type: 'number',
          minimum: 0,
          nullable: true,
        },
        paymentCurrency: {
          type: 'string',
          pattern: '^[A-Z]{3}$',
          nullable: true,
        },
        paymentPurpose: {
          type: 'string',
          maxLength: 500,
          nullable: true,
        },
      },
      nullable: true,
      required: [],
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
    },
  },
  required: ['requestId', 'requester', 'payee', 'timestamp'],
  additionalProperties: false,
};

const validateVopRequest = ajv.compile(vopRequestSchema);

/**
 * Validation middleware for VoP requests
 */
export function validateRequest(req: Request, res: Response, next: NextFunction): void {
  const valid = validateVopRequest(req.body);

  if (!valid) {
    const errors = validateVopRequest.errors?.map((err) => ({
      field: err.instancePath || err.params['missingProperty'] || 'unknown',
      message: err.message || 'Validation error',
      value: err.data,
    }));

    logger.warn('Request validation failed', {
      errors,
      body: req.body,
    });

    res.status(400).json({
      error: 'validation_error',
      message: 'Request validation failed',
      details: errors,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Additional business logic validation
  const request = req.body as VopRequest;

  // Check timestamp is not too old (max 5 minutes)
  const requestTime = new Date(request.timestamp).getTime();
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  if (now - requestTime > maxAge) {
    logger.warn('Request timestamp too old', {
      requestId: request.requestId,
      timestamp: request.timestamp,
      age: now - requestTime,
    });

    res.status(400).json({
      error: 'validation_error',
      message: 'Request timestamp is too old (max 5 minutes)',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Check timestamp is not in the future (allow 1 minute clock skew)
  if (requestTime > now + 60000) {
    logger.warn('Request timestamp in future', {
      requestId: request.requestId,
      timestamp: request.timestamp,
    });

    res.status(400).json({
      error: 'validation_error',
      message: 'Request timestamp cannot be in the future',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // Validate IBAN checksum (Ukrainian IBAN)
  if (!validateIBANChecksum(request.payee.iban)) {
    logger.warn('Invalid IBAN checksum', {
      requestId: request.requestId,
      iban: request.payee.iban,
    });

    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid IBAN checksum',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}

/**
 * Validate IBAN checksum using mod-97 algorithm
 */
function validateIBANChecksum(iban: string): boolean {
  // Move first 4 characters to end
  const rearranged = iban.substring(4) + iban.substring(0, 4);

  // Replace letters with numbers (A=10, B=11, ..., Z=35)
  let numeric = '';
  for (const char of rearranged) {
    if (char >= 'A' && char <= 'Z') {
      numeric += (char.charCodeAt(0) - 'A'.charCodeAt(0) + 10).toString();
    } else {
      numeric += char;
    }
  }

  // Calculate mod 97
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + parseInt(digit, 10)) % 97;
  }

  return remainder === 1;
}

export default validateRequest;
