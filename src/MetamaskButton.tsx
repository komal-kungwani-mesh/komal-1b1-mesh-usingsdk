import * as React from 'react';

import styles from './App.module.css';
import { ReactComponent as MetamaskLogo } from './assets/metamask.svg';
import { ENDPOINTS } from './endpoints';
import type { LinkTokenRequest, LinkTokenResponse } from './types/linkTokenTypes';
import type { HoldingsResponseEnvelope, MeshHoldingPosition } from './types/holdingsTypes';
import type { MeshConnectedAccountInfo } from './types/connectedAccountTypes';
import { createLink, type Link, type LinkPayload, type IntegrationAccessToken } from '@meshconnect/web-link-sdk';


interface MetamaskButtonProps {
  onClick?: () => void;
  onDataUpdated?: (info: MeshConnectedAccountInfo) => void;
  onRefreshAvailable?: (refreshFn: (() => Promise<void>) | undefined) => void;
}


const CLIENT_ID = process.env.REACT_APP_MESH_CLIENT_ID;
const CLIENT_SECRET = process.env.REACT_APP_MESH_CLIENT_SECRET;
const USER_ID = process.env.REACT_APP_MESH_USER_ID;
const INTEGRATION_ID = process.env.REACT_APP_MESH_METAMASK_INTEGRATION_ID ?? 'metamask';
const NETWORK_ID = process.env.REACT_APP_MESH_METAMASK_NETWORK_ID;
const DEFAULT_SYMBOL = 'USDC';

const MetamaskButton: React.FC<MetamaskButtonProps> = ({ onDataUpdated, onRefreshAvailable }) => {
  const meshLinkRef = React.useRef<Link | null>(null);
  const [holdings, setHoldings] = React.useState<MeshHoldingPosition[]>([]);
  const [holdingsError, setHoldingsError] = React.useState<string | null>(null);
  const [isLoadingHoldings, setIsLoadingHoldings] = React.useState(false);
  const [connectedAccountLabel, setConnectedAccountLabel] = React.useState<string | null>(null);
  const [connectedInstitution, setConnectedInstitution] = React.useState<string | null>(null);
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [isLinking, setIsLinking] = React.useState(false);
  const [managedAddress, setManagedAddress] = React.useState<string | null>(null);
  const [managedAddressError, setManagedAddressError] = React.useState<string | null>(null);
  const [isLoadingAddress, setIsLoadingAddress] = React.useState(false);
  const [authToken, setAuthToken] = React.useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const authTokenRef = React.useRef<string | null>(null);
  const brokerTypeRef = React.useRef<string | undefined>(undefined);
  const integrationTokenRef = React.useRef<IntegrationAccessToken | null>(null);
  const managedAddressRef = React.useRef<string | null>(null);

  const formatNumber = React.useCallback((value: unknown, options?: Intl.NumberFormatOptions) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return '0';
    }
    return numeric.toLocaleString(undefined, {
      maximumFractionDigits: 6,
      minimumFractionDigits: numeric < 1 ? 2 : 0,
      ...options,
    });
  }, []);

  const fetchHoldings = React.useCallback(async (authToken: string, brokerType?: string) => {
    if (!CLIENT_ID || !CLIENT_SECRET) {
      setHoldingsError('Mesh credentials are not configured. Please set the required environment variables.');
      return;
    }

    setIsLoadingHoldings(true);
    setHoldingsError(null);

    try {
      const response = await fetch(ENDPOINTS.HOLDINGS_GET, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': CLIENT_ID,
          'X-Client-Secret': CLIENT_SECRET,
        },
        body: JSON.stringify({
          authToken,
          type: brokerType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Holdings request failed (${response.status})`);
      }

      const result: HoldingsResponseEnvelope = await response.json();
      const cryptoPositions = result.content?.cryptocurrencyPositions ?? [];
      const equityPositions = result.content?.equityPositions ?? [];
      const combinedPositions = [...cryptoPositions, ...equityPositions].filter(Boolean) as MeshHoldingPosition[];

      setHoldings(combinedPositions);
      if (result.content?.institutionName) {
        setConnectedInstitution(result.content.institutionName);
      }
    } catch (error) {
      console.error('Failed to fetch holdings', error);
      setHoldings([]);
      setHoldingsError(error instanceof Error ? error.message : 'Failed to fetch holdings');
    } finally {
      setIsLoadingHoldings(false);
    }
  }, []);

  const fetchManagedAddress = React.useCallback(
    async (token: string, type?: string, networkId?: string, symbol?: string): Promise<string | null> => {
      if (!CLIENT_ID || !CLIENT_SECRET) {
        setManagedAddressError('Mesh credentials are not configured. Please set the required environment variables.');
        return null;
      }

      if (!networkId || !symbol) {
        return managedAddressRef.current;
      }

      setIsLoadingAddress(true);
      setManagedAddressError(null);

      try {
        const response = await fetch(ENDPOINTS.MANAGED_ADDRESS_GET, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': CLIENT_ID,
            'X-Client-Secret': CLIENT_SECRET,
          },
          body: JSON.stringify({
            authToken: token,
            type,
            networkId,
            symbol,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `Managed address request failed (${response.status})`);
        }

        const data: { content?: { address?: string } } = await response.json();
        const address = data.content?.address;
        if (!address) {
          throw new Error('Managed address missing from response payload');
        }
        setManagedAddress(address);
        managedAddressRef.current = address;
        return address;
      } catch (error) {
        console.error('Failed to fetch managed address', error);
        setManagedAddress(null);
        managedAddressRef.current = null;
        setManagedAddressError(error instanceof Error ? error.message : 'Failed to fetch managed deposit address.');
        return null;
      } finally {
        setIsLoadingAddress(false);
      }
    },
    [],
  );

  const refreshData = React.useCallback(
    async (
      tokenOverride?: string | null,
      brokerOverride?: string,
      integrationTokenOverride?: IntegrationAccessToken | null,
      accountLabelOverride?: string | null,
      brokerNameOverride?: string | null,
    ) => {
      const effectiveToken = tokenOverride ?? authTokenRef.current;
      const effectiveBroker = brokerOverride ?? brokerTypeRef.current;
      const effectiveIntegration = integrationTokenOverride ?? integrationTokenRef.current;
      const effectiveAccountLabel = accountLabelOverride ?? connectedAccountLabel;
      const effectiveBrokerName = brokerNameOverride ?? connectedInstitution;

      if (!effectiveToken) {
        console.warn('No Mesh auth token available for refresh.');
        return;
      }

      setIsRefreshing(true);
      try {
        const [, latestAddress] = await Promise.all([
          fetchHoldings(effectiveToken, effectiveBroker),
          fetchManagedAddress(effectiveToken, effectiveBroker, NETWORK_ID, DEFAULT_SYMBOL),
        ]);

        const addressToReport =
          typeof latestAddress === 'string'
            ? latestAddress
            : managedAddressRef.current ?? null;

        if (onDataUpdated) {
          onDataUpdated({
            authToken: effectiveToken,
            brokerType: effectiveBroker,
            brokerName: effectiveBrokerName ?? undefined,
            accountLabel: effectiveAccountLabel ?? undefined,
            integrationToken: effectiveIntegration,
            managedAddress: addressToReport,
            networkId: NETWORK_ID ?? undefined,
          });
        }
      } finally {
        setIsRefreshing(false);
      }
    },
    [connectedAccountLabel, connectedInstitution, fetchHoldings, fetchManagedAddress, onDataUpdated],
  );

  const handleIntegrationConnected = React.useCallback(
    async (payload: LinkPayload) => {
      const accessTokenPayload = payload.accessToken;
      const primaryAccountToken = accessTokenPayload?.accountTokens?.[0];
      const authToken = primaryAccountToken?.accessToken;

      if (!authToken) {
        console.warn('Mesh link session completed without an auth token.');
        return;
      }

      const accountLabel =
        primaryAccountToken.account?.accountName ||
        accessTokenPayload?.brokerName ||
        'Connected account';

      setConnectedAccountLabel(accountLabel);
      setConnectedInstitution(accessTokenPayload?.brokerName ?? 'MetaMask');
      setHoldings([]);
      setManagedAddress(null);
      setManagedAddressError(null);
      managedAddressRef.current = null;

      const integrationAccessToken: IntegrationAccessToken = {
        accountId: primaryAccountToken.account?.accountId ?? primaryAccountToken.account?.accountName ?? '',
        accountName: primaryAccountToken.account?.accountName ?? accountLabel,
        accessToken: primaryAccountToken.accessToken,
        brokerType: accessTokenPayload?.brokerType ?? 'metamask',
        brokerName: accessTokenPayload?.brokerName ?? 'MetaMask',
      };

      integrationTokenRef.current = integrationAccessToken;

      setAuthToken(authToken);
      authTokenRef.current = authToken;

      const nextBrokerType = accessTokenPayload?.brokerType;
      brokerTypeRef.current = nextBrokerType;

      await refreshData(authToken, nextBrokerType, integrationAccessToken, accountLabel, integrationAccessToken.brokerName ?? null);
    },
    [refreshData],
  );

  const getOrCreateMeshLink = React.useCallback(() => {
    if (!meshLinkRef.current) {
      if (!CLIENT_ID) {
        console.error('Missing REACT_APP_MESH_CLIENT_ID environment variable.');
        return null;
      }
      meshLinkRef.current = createLink({
        clientId: CLIENT_ID,
        onIntegrationConnected: (payload) => {
          console.log('Mesh integration connected', payload);
          void handleIntegrationConnected(payload);
        },
        onExit: (error) => {
          if (error) {
            console.error('Mesh link exited with error', error);
          }
        },
      });
    }

    return meshLinkRef.current;
  }, [handleIntegrationConnected]);

  React.useEffect(() => {
    getOrCreateMeshLink();

    return () => {
      meshLinkRef.current?.closeLink();
      meshLinkRef.current = null;
    };
  }, [getOrCreateMeshLink]);

  React.useEffect(() => {
    if (!onRefreshAvailable) {
      return;
    }
    const refreshFn = () => refreshData();
    onRefreshAvailable(() => refreshFn());
    return () => {
      onRefreshAvailable(undefined);
    };
  }, [onRefreshAvailable, refreshData]);

  const handleClick = async () => {
    if (!CLIENT_ID || !CLIENT_SECRET || !USER_ID) {
      setLinkError('Mesh credentials are not configured. Please set the required environment variables.');
      return;
    }

    setIsLinking(true);
    setLinkError(null);

    const myHeaders = new Headers();
    myHeaders.append('Content-Type', 'application/json');
    myHeaders.append('X-Client-Id', CLIENT_ID);
    myHeaders.append('X-Client-Secret', CLIENT_SECRET);

    const body: LinkTokenRequest = {
      userId: USER_ID,
      integrationId: INTEGRATION_ID,
      restrictMultipleAccounts: false,
      disableApiKeyGeneration: false,
      isInclusiveFeeEnabled: true,
    };

    if (NETWORK_ID) {
      body.verifyWalletOptions = {
        networkId: NETWORK_ID,
        verificationMethods: ['signedMessage'],
      };
    }

    const requestOptions: RequestInit = {
      method: 'POST',
      headers: myHeaders,
      body: JSON.stringify(body),
      redirect: 'follow',
    };

    try {
      const response = await fetch(ENDPOINTS.LINK_TOKEN, requestOptions);
      if (!response.ok) {
        const errorBody = await response.text();
        let message = `Unable to start Mesh session (status ${response.status}).`;
        try {
          const parsed = JSON.parse(errorBody);
          const candidate = parsed?.message || parsed?.error || parsed?.errorMessage;
          if (typeof candidate === 'string' && candidate.trim()) {
            message = candidate;
          }
        } catch {
          if (errorBody) {
            message = errorBody;
          }
        }
        throw new Error(message);
      }
      const data: LinkTokenResponse = await response.json();
      const linkToken = data.linkToken || (data as Record<string, any>)?.content?.linkToken;

      if (!linkToken) {
        throw new Error('Link token missing from response payload');
      }

      try {
        localStorage.setItem('mesh-link-token-metamask', linkToken);
      } catch (storageError) {
        console.warn('Failed to persist link token to localStorage', storageError);
      }

      const meshLink = getOrCreateMeshLink();
      meshLink?.openLink(linkToken);

      console.log('Link Token Response', data);
    } catch (error) {
      console.error('Failed to get link token', error);
      setLinkError(error instanceof Error ? error.message : 'Failed to fetch Mesh link token.');
    }
    setIsLinking(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', position: 'relative' }}>
      <button
        className={styles.tryButton}
        style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 220, opacity: isLinking ? 0.7 : 1 }}
        onClick={handleClick}
        disabled={isLinking}
      >
        <MetamaskLogo style={{ width: 32, height: 32 }} />
        {isLinking ? 'Connecting…' : 'Connect to MetaMask'}
      </button>
      {linkError && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(5, 15, 30, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          role="presentation"
        >
          <div
            style={{
              background: '#071a33',
              borderRadius: 16,
              padding: '24px 28px',
              maxWidth: 420,
              width: 'calc(100% - 32px)',
              boxShadow: '0 18px 40px rgba(3, 127, 255, 0.35)',
              border: '1px solid rgba(21, 230, 205, 0.35)',
              color: '#f4faff',
            }}
            role="alertdialog"
            aria-modal="true"
          >
            <h3 style={{ margin: '0 0 12px', color: '#15e6cd', fontSize: 20 }}>Unable to connect</h3>
            <p style={{ margin: '0 0 20px', lineHeight: 1.4 }}>{linkError}</p>
            <button
              onClick={() => setLinkError(null)}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                background: 'linear-gradient(90deg, #037fff 0%, #15e6cd 100%)',
                border: 'none',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
      {(connectedAccountLabel || holdingsError || isLoadingHoldings || holdings.length > 0 || managedAddressError || isLoadingAddress || managedAddress) && (
        <div
          style={{
            marginTop: 24,
            width: '100%',
            maxWidth: 420,
            background: 'rgba(9, 30, 60, 0.85)',
            borderRadius: 16,
            padding: 20,
            color: '#f4faff',
            boxShadow: '0 6px 24px rgba(3, 127, 255, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 20, color: '#15e6cd' }}>
              {connectedInstitution ?? 'MetaMask'} holdings
            </h3>
            {authToken && (
              <button
                onClick={() => void refreshData()}
                disabled={isRefreshing || isLoadingHoldings || isLoadingAddress}
                style={{
                  padding: '6px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(21, 230, 205, 0.35)',
                  background: 'rgba(3, 31, 58, 0.85)',
                  color: '#15e6cd',
                  fontWeight: 600,
                  cursor: isRefreshing || isLoadingHoldings || isLoadingAddress ? 'not-allowed' : 'pointer',
                  opacity: isRefreshing || isLoadingHoldings || isLoadingAddress ? 0.65 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {isRefreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>
          {connectedAccountLabel && (
            <p style={{ margin: '0 0 16px', color: '#9fc3ff', fontSize: 14 }}>
              Account: {connectedAccountLabel}
            </p>
          )}
          {isLoadingHoldings && <p style={{ margin: 0 }}>Loading holdings…</p>}
          {holdingsError && (
            <p style={{ margin: 0, color: '#ff8a8a' }}>{holdingsError}</p>
          )}
          {!isLoadingHoldings && !holdingsError && holdings.length === 0 && connectedAccountLabel && (
            <p style={{ margin: 0 }}>No holdings available for this account.</p>
          )}
          {!isLoadingHoldings && !holdingsError && holdings.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {holdings.map((position, index) => (
                <div
                  key={`${position.symbol ?? position.name ?? 'asset'}-${index}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(3, 23, 48, 0.8)',
                    borderRadius: 12,
                    padding: '12px 16px',
                    border: '1px solid rgba(21, 230, 205, 0.15)',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontWeight: 600, fontSize: 16 }}>
                      {position.symbol ?? position.name ?? 'Asset'}
                    </span>
                    {position.name && position.symbol && position.name !== position.symbol && (
                      <span style={{ fontSize: 12, color: '#9fc3ff' }}>{position.name}</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 14 }}>
                    <div>{formatNumber(position.amount)}</div>
                    {position.fiatAmount != null && (
                      <div style={{ color: '#9fc3ff', fontSize: 12 }}>
                        ≈ {formatNumber(position.fiatAmount, {
                          style: 'currency',
                          currency: position.fiatCurrency || 'USD',
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {(isLoadingAddress || managedAddressError || managedAddress) && (
            <div style={{ marginTop: 24 }}>
              <h4 style={{ margin: '0 0 12px', color: '#15e6cd', fontSize: 16 }}>Managed deposit address</h4>
              {isLoadingAddress && <p style={{ margin: 0 }}>Fetching deposit address…</p>}
              {managedAddressError && (
                <p style={{ margin: 0, color: '#ff8a8a' }}>{managedAddressError}</p>
              )}
              {!isLoadingAddress && !managedAddressError && managedAddress && (
                <div
                  style={{
                    fontSize: 13,
                    color: '#f4faff',
                    background: 'rgba(7, 26, 51, 0.75)',
                    padding: '12px 14px',
                    borderRadius: 10,
                    wordBreak: 'break-all',
                    border: '1px solid rgba(21, 230, 205, 0.15)',
                  }}
                >
                  {managedAddress}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MetamaskButton;
