/**
 * VoP Requester - Basic Usage Example
 */

import { VopRequesterClient, VopError, VopTimeoutError } from '../src/client';

async function main() {
  // Initialize VoP client
  const client = new VopRequesterClient({
    routerUrl: 'https://vop-router.nbu.gov.ua',
    requesterBIC: 'PBUA', // ПриватБанк
    tlsCert: '/path/to/certs/client.crt',
    tlsKey: '/path/to/certs/client.key',
    tlsCA: '/path/to/certs/ca.crt',
    oauthTokenUrl: 'https://auth.nbu.gov.ua/oauth2/token',
    oauthClientId: 'vop-client-pbua',
    oauthClientSecret: 'your-client-secret',
    timeout: 5000,
  });

  // Example 1: Perfect match
  console.log('Example 1: Perfect name match');
  try {
    const result1 = await client.verify({
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
      accountType: 'PERSONAL',
    });

    console.log('Result:', result1);
    // {
    //   requestId: "REQ-20260207103000-A1B2C3",
    //   matchStatus: "MATCH",
    //   matchScore: 100,
    //   verifiedName: "ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ",
    //   accountType: "PERSONAL",
    //   accountStatus: "ACTIVE",
    //   reasonCode: "ANNM",
    //   responder: { bic: "PBUA" },
    //   timestamp: "2026-02-07T10:30:00.450Z"
    // }
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 2: Name with typo (close match)
  console.log('\nExample 2: Name with typo');
  try {
    const result2 = await client.verify({
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВІЧ', // Typo: ГРИГОРОВІЧ instead of ГРИГОРОВИЧ
      accountType: 'PERSONAL',
    });

    if (result2.matchStatus === 'CLOSE_MATCH') {
      console.log(`⚠️ Warning: Name partially matches`);
      console.log(`Expected: ${result2.verifiedName}`);
      console.log(`Match score: ${result2.matchScore}%`);
      // Ask user for confirmation before proceeding
    }
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 3: Wrong name (no match)
  console.log('\nExample 3: Wrong name');
  try {
    const result3 = await client.verify({
      iban: 'UA213052990000026007233566001',
      name: 'ІВАНОВ ІВАН ІВАНОВИЧ', // Wrong name
      accountType: 'PERSONAL',
    });

    if (result3.matchStatus === 'NO_MATCH') {
      console.log(`❌ Error: Name does not match`);
      console.log(`Account holder: ${result3.verifiedName}`);
      // Block payment or warn user
    }
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 4: High-value payment
  console.log('\nExample 4: High-value payment with VoP');
  try {
    const result4 = await client.verify({
      iban: 'UA213052990000026007233566001',
      name: 'ШЕВЧЕНКО ТАРАС ГРИГОРОВИЧ',
      accountType: 'PERSONAL',
      paymentAmount: 500000, // 500,000 UAH
      paymentCurrency: 'UAH',
      paymentPurpose: 'Salary payment',
    });

    if (result4.matchStatus === 'MATCH') {
      console.log('✅ High-value payment verified, safe to proceed');
    }
  } catch (error) {
    console.error('Error:', error);
  }

  // Example 5: Error handling
  console.log('\nExample 5: Error handling');
  try {
    const result5 = await client.verify({
      iban: 'UA999999999999999999999999999', // Invalid IBAN
      name: 'Test User',
    });
  } catch (error) {
    if (error instanceof VopTimeoutError) {
      console.error('⏱️ VoP timeout - allow payment with warning');
    } else if (error instanceof VopError) {
      console.error(`❌ VoP error: ${error.code} - ${error.message}`);
      if (error.code === 'NSUP') {
        console.log('ℹ️ VoP not supported for this bank, proceed with caution');
      }
    } else {
      console.error('Unexpected error:', error);
    }
  }
}

main().catch(console.error);
