export interface MeshHoldingDistribution {
  caipNetworkId?: string;
  address?: string;
  amount?: number;
  [key: string]: unknown;
}

export interface MeshHoldingPosition {
  name?: string;
  symbol?: string;
  amount?: number;
  fiatAmount?: number;
  fiatCurrency?: string;
  distribution?: MeshHoldingDistribution[];
  [key: string]: unknown;
}

export interface MeshHoldingsContent {
  cryptocurrencyPositions?: MeshHoldingPosition[];
  equityPositions?: MeshHoldingPosition[];
  notSupportedCryptocurrencyPositions?: MeshHoldingPosition[];
  notSupportedEquityPositions?: MeshHoldingPosition[];
  nftPositions?: MeshHoldingPosition[];
  optionPositions?: MeshHoldingPosition[];
  accountName?: string;
  institutionName?: string;
  type?: string;
  accountId?: string;
  status?: string;
  displayMessage?: string;
  errorMessage?: string;
  [key: string]: unknown;
}

export interface HoldingsResponseEnvelope {
  content?: MeshHoldingsContent;
  status?: string;
  message?: string;
  errorType?: string;
  [key: string]: unknown;
}
