export const API_BASE_URL = "https://integration-api.meshconnect.com/api/v1";

export const ENDPOINTS = {
  LINK_TOKEN: `${API_BASE_URL}/linktoken`,
  HOLDINGS_GET: `${API_BASE_URL}/holdings/get`,
  WALLETS_GET: `${API_BASE_URL}/wallets/get`,
  MANAGED_ADDRESS_GET: `${API_BASE_URL}/transfers/managed/address/get`,
} as const;
