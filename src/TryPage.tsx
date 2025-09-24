
import * as React from 'react';

import styles from './App.module.css';
import { ReactComponent as MeshLogo } from './assets/mesh-logo.svg';
import BinanceButton from './BinanceButton';
import MetamaskButton from './MetamaskButton';
import { ENDPOINTS } from './endpoints';
import { createLink, type Link, type TransferFinishedPayload } from '@meshconnect/web-link-sdk';
import type { MeshConnectedAccountInfo } from './types/connectedAccountTypes';
import type { LinkTokenRequest, LinkTokenResponse } from './types/linkTokenTypes';

const CLIENT_ID = process.env.REACT_APP_MESH_CLIENT_ID;
const CLIENT_SECRET = process.env.REACT_APP_MESH_CLIENT_SECRET;
const USER_ID = process.env.REACT_APP_MESH_USER_ID;
const METAMASK_INTEGRATION_ID = process.env.REACT_APP_MESH_METAMASK_INTEGRATION_ID ?? 'metamask';
const METAMASK_NETWORK_ID = process.env.REACT_APP_MESH_METAMASK_NETWORK_ID;

function TryPage() {
  const [binanceAccount, setBinanceAccount] = React.useState<MeshConnectedAccountInfo | null>(null);
  const [metamaskAccount, setMetamaskAccount] = React.useState<MeshConnectedAccountInfo | null>(null);
  const binanceRefreshRef = React.useRef<(() => Promise<void>) | null>(null);
  const metamaskRefreshRef = React.useRef<(() => Promise<void>) | null>(null);
  const [transferAmount, setTransferAmount] = React.useState('');
  const [transferError, setTransferError] = React.useState<string | null>(null);
  const [isTransferring, setIsTransferring] = React.useState(false);
  const transferLinkRef = React.useRef<Link | null>(null);
  const [transferDetails, setTransferDetails] = React.useState<TransferFinishedPayload | null>(null);

  const handleBinanceData = React.useCallback((info: MeshConnectedAccountInfo) => {
    setBinanceAccount(info);
  }, []);

  const handleMetamaskData = React.useCallback((info: MeshConnectedAccountInfo) => {
    setMetamaskAccount(info);
  }, []);

  const registerBinanceRefresh = React.useCallback((refreshFn: (() => Promise<void>) | undefined) => {
    binanceRefreshRef.current = refreshFn ?? null;
  }, []);

  const registerMetamaskRefresh = React.useCallback((refreshFn: (() => Promise<void>) | undefined) => {
    metamaskRefreshRef.current = refreshFn ?? null;
  }, []);

  React.useEffect(() => () => {
    transferLinkRef.current?.closeLink();
    transferLinkRef.current = null;
  }, []);

  const handleTransfer = React.useCallback(async () => {
    if (!CLIENT_ID || !CLIENT_SECRET || !USER_ID) {
      setTransferError('Mesh credentials are not configured. Please set the required environment variables.');
      return;
    }

    if (!metamaskAccount) {
      setTransferError('Connect MetaMask before transferring.');
      return;
    }

    if (!metamaskAccount.integrationToken || !metamaskAccount.authToken) {
      setTransferError('MetaMask authorization is incomplete. Refresh the connection and try again.');
      return;
    }

    if (!binanceAccount) {
      setTransferError('Connect Binance before initiating a transfer.');
      return;
    }

    if (!binanceAccount.integrationToken) {
      setTransferError('Binance authorization is incomplete. Refresh the connection and try again.');
      return;
    }

    if (!binanceAccount.managedAddress) {
      setTransferError('Binance managed deposit address is unavailable. Refresh the Binance connection and try again.');
      return;
    }

    const parsedAmount = Number.parseFloat(transferAmount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setTransferError('Enter a valid USDC amount greater than 0.');
      return;
    }

    setTransferError(null);
    setTransferDetails(null);
    setIsTransferring(true);

    try {
      transferLinkRef.current?.closeLink();
      transferLinkRef.current = null;

      const transferLink = createLink({
        clientId: CLIENT_ID,
        accessTokens: [],
        transferDestinationTokens: [],
        onTransferFinished: async (payload) => {
          setTransferDetails(payload);
          try {
            await Promise.all([
              metamaskRefreshRef.current ? metamaskRefreshRef.current() : Promise.resolve(),
              binanceRefreshRef.current ? binanceRefreshRef.current() : Promise.resolve(),
            ]);
          } catch (refreshError) {
            console.error('Failed to refresh after transfer', refreshError);
          }
          transferLinkRef.current = null;
        },
        onExit: (error) => {
          if (error) {
            setTransferError(error);
          }
          transferLinkRef.current = null;
        },
      });

      transferLinkRef.current = transferLink;

      const headers = new Headers();
      headers.append('Content-Type', 'application/json');
      headers.append('X-Client-Id', CLIENT_ID);
      headers.append('X-Client-Secret', CLIENT_SECRET);

      const transferAddress = binanceAccount.managedAddress;
      const destinationNetworkId =
        binanceAccount.networkId ?? METAMASK_NETWORK_ID ?? METAMASK_INTEGRATION_ID ?? '';
      const verificationNetworkId = METAMASK_NETWORK_ID ?? METAMASK_INTEGRATION_ID ?? '';

      if (!destinationNetworkId || !verificationNetworkId) {
        throw new Error('Unable to determine network id for transfer.');
      }

      const body = {
        userId: USER_ID,
        integrationId: METAMASK_INTEGRATION_ID,
        restrictMultipleAccounts: false,
        disableApiKeyGeneration: false,
        verifyWalletOptions: {
          networkId: verificationNetworkId,
          verificationMethods: ['signedMessage'],
        },
        transferOptions: {
          toAddresses: [
            {
              networkId: destinationNetworkId,
              symbol: 'USDC',
              address: transferAddress,
              amount: parsedAmount,
            },
          ],
          isInclusiveFeeEnabled: false,
        },
      } satisfies LinkTokenRequest & {
        transferOptions: {
          toAddresses: Array<{ networkId: string; symbol: string; address: string; amount: number }>;
          isInclusiveFeeEnabled: boolean;
        };
      };

      const response = await fetch(ENDPOINTS.LINK_TOKEN, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        let message = `Unable to start transfer session (status ${response.status}).`;
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

      console.log('Initiating transfer', {
        amount: parsedAmount,
        sourceAccount: metamaskAccount.accountLabel,
        destinationAccount: binanceAccount.accountLabel,
      });

      transferLink.openLink(linkToken);
    } catch (error) {
      console.error('Failed to initiate transfer', error);
      transferLinkRef.current = null;
      setTransferError(error instanceof Error ? error.message : 'Failed to initiate transfer session.');
    } finally {
      setIsTransferring(false);
    }
  }, [binanceAccount, metamaskAccount, transferAmount]);

  const onAmountChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setTransferAmount(event.target.value);
      if (transferError) {
        setTransferError(null);
      }
    },
    [transferError],
  );

  const parsedAmount = Number.parseFloat(transferAmount);
  const isAmountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const destinationAddress = binanceAccount?.managedAddress ?? null;

  const canTransfer =
    Boolean(
      metamaskAccount &&
      metamaskAccount.integrationToken &&
      metamaskAccount.authToken &&
      binanceAccount &&
      binanceAccount.integrationToken &&
      destinationAddress &&
      isAmountValid,
    ) && !isTransferring;

  return (
    <div className={styles.meshAppBg}>
      <span className={styles.meshBgLogo}><MeshLogo /></span>
      <div className={styles.meshHeader}>
        <h2 className={styles.meshTitle}>Try Mesh</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', marginTop: 32 }}>
          <BinanceButton
            onDataUpdated={handleBinanceData}
            onRefreshAvailable={registerBinanceRefresh}
          />
          <MetamaskButton
            onDataUpdated={handleMetamaskData}
            onRefreshAvailable={registerMetamaskRefresh}
          />
        </div>
        <div
          style={{
            marginTop: 40,
            width: '100%',
            maxWidth: 420,
            background: 'rgba(5, 20, 42, 0.85)',
            borderRadius: 20,
            padding: 24,
            color: '#f4faff',
            boxShadow: '0 8px 28px rgba(3, 127, 255, 0.22)',
          }}
        >
          <h3 style={{ margin: '0 0 12px', fontSize: 20, color: '#15e6cd' }}>
            Transfer coins from MetaMask to Binance
          </h3>
          <p style={{ margin: '0 0 18px', color: '#9fc3ff', fontSize: 14 }}>
            Enter the USDC amount to initiate a Mesh-guided transfer from your connected MetaMask wallet to the
            connected Binance account.
          </p>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <input
              type="number"
              min="0"
              step="0.000001"
              value={transferAmount}
              onChange={onAmountChange}
              placeholder="Amount in USDC"
              style={{
                flex: 1,
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(21, 230, 205, 0.25)',
                background: 'rgba(3, 23, 48, 0.7)',
                color: '#f4faff',
                fontSize: 14,
              }}
            />
            <button
              onClick={() => void handleTransfer()}
              disabled={!canTransfer}
              style={{
                padding: '10px 20px',
                borderRadius: 14,
                border: 'none',
                background: canTransfer
                  ? 'linear-gradient(90deg, #037fff 0%, #15e6cd 100%)'
                  : 'rgba(3, 31, 58, 0.5)',
                color: '#fff',
                fontWeight: 700,
                cursor: canTransfer ? 'pointer' : 'not-allowed',
                transition: 'opacity 0.2s ease',
                opacity: isTransferring ? 0.75 : 1,
                minWidth: 120,
              }}
            >
              {isTransferring ? 'Starting…' : 'Transfer'}
            </button>
          </div>
          {transferError && (
            <p style={{ margin: '0 0 12px', color: '#ff8a8a', fontSize: 13 }}>{transferError}</p>
          )}
          <div style={{ fontSize: 13, color: '#9fc3ff', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span>
              Source: {metamaskAccount?.accountLabel ?? 'MetaMask connection required'}
            </span>
            <span>
              Destination: {binanceAccount?.accountLabel ?? 'Binance connection required'}
            </span>
            <span style={{ wordBreak: 'break-all' }}>
              Deposit address: {destinationAddress ?? 'Not available yet'}
            </span>
          </div>
          {transferDetails && (
            <div
              style={{
                marginTop: 18,
                padding: '12px 16px',
                borderRadius: 12,
                background: 'rgba(7, 26, 51, 0.75)',
                border: '1px solid rgba(21, 230, 205, 0.2)',
                fontSize: 13,
                color: '#9fc3ff',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <strong style={{ color: '#15e6cd' }}>Transfer completed</strong>
              <span>Amount: {transferDetails.amount} {transferDetails.symbol}</span>
              <span>Tx ID: {transferDetails.txId ?? 'N/A'}</span>
              {transferDetails.txHash && <span>Tx Hash: {transferDetails.txHash}</span>}
              <span>To: {transferDetails.toAddress}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default TryPage;
