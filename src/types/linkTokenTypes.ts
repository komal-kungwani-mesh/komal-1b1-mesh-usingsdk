// Types for Mesh Link Token API request and response
// Reference: https://docs.meshconnect.com/api-reference/managed-account-authentication/get-link-token-with-parameters

export interface LinkTokenRequest {
  userId: string;
  integrationId: string;
  restrictMultipleAccounts?: boolean;
  disableApiKeyGeneration?: boolean;
  verifyWalletOptions?: {
    networkId: string;
    verificationMethods: string[];
    addresses?: string[];
  };
  isInclusiveFeeEnabled?: boolean;
}

export interface LinkTokenResponse {
  linkToken: string;
  expiration: string;
  userId: string;
  integrationId: string;
  createdAt: string;
  expiresAt: string;
  [key: string]: any;
}
