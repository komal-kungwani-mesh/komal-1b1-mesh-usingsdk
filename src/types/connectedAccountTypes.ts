import type { IntegrationAccessToken } from '@meshconnect/web-link-sdk';

export interface MeshConnectedAccountInfo {
  authToken: string;
  brokerType?: string;
  brokerName?: string;
  accountLabel?: string;
  integrationToken?: IntegrationAccessToken | null;
  managedAddress?: string | null;
  networkId?: string;
}

