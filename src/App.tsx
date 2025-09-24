import styles from './App.module.css';
import { ReactComponent as MeshLogo } from './assets/mesh-logo.svg';
import { ReactComponent as UsdtIcon } from './assets/usdt.svg';
import { ReactComponent as UsdcIcon } from './assets/usdc.svg';
import { ReactComponent as DaiIcon } from './assets/dai.svg';
import { ReactComponent as EthIcon } from './assets/eth.svg';

import TryPage from './TryPage';
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';


function HomePage() {
  const navigate = useNavigate();
  return (
    <div className={styles.meshAppBg}>
      {/* Mesh logo SVG watermark in the background */}
      <span className={styles.meshBgLogo}><MeshLogo /></span>
      <div className={styles.meshHeader}>
        <h1 className={styles.meshTitle}>welcome to mesh connect wallet app</h1>
        <div className={styles.meshBenefits}>
          <p className={styles.meshBenefitMain}>Payments made so easy — pay directly with stable coins, no hassle!</p>
          <ul className={styles.meshBenefitList}>
            <li>⚡ Instant, borderless transactions</li>
            <li>🔒 Secure & transparent payments</li>
            <li>💸 No hidden fees or delays</li>
            <li>🌐 Use USDT, USDC, DAI, and more</li>
            <li>🚀 Powered by Mesh for seamless crypto experiences</li>
          </ul>
        </div>
        <div className={styles.coinAnimationPath}>
          <span className={styles.coin}><UsdtIcon /></span>
          <span className={styles.coin}><UsdcIcon /></span>
          <span className={styles.coin}><DaiIcon /></span>
          <span className={styles.coin}><EthIcon /></span>
        </div>
        <button className={styles.tryButton} onClick={() => navigate('/try')}>Try out yourself...</button>
      </div>
    </div>
  );
}



const App = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/try" element={<TryPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
