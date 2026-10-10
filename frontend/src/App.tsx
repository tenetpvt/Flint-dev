import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { CommandCenter } from './pages/CommandCenter';
import { LiveMap } from './pages/LiveMap';
import { Analytics } from './pages/Analytics';
import { CostBudget } from './pages/CostBudget';
import { LiveAlerts } from './pages/LiveAlerts';
import { VideoVault } from './pages/VideoVault';
import { CivicRedressal } from './pages/CivicRedressal';
import { Fleet } from './pages/Fleet';
import { SystemStatus } from './pages/SystemStatus';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/command-center" replace />} />
          <Route path="command-center" element={<CommandCenter />} />
          <Route path="live-map" element={<LiveMap />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="cost-budget" element={<CostBudget />} />
          <Route path="live-alerts" element={<LiveAlerts />} />
          <Route path="complaints" element={<CivicRedressal />} />
          <Route path="grievances" element={<Navigate to="/complaints" replace />} />
          <Route path="video-vault" element={<VideoVault />} />
          <Route path="fleet" element={<Fleet />} />
          <Route path="system-status" element={<SystemStatus />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
