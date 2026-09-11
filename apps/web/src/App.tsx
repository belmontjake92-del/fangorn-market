import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Overview from "./pages/Overview";
import Marketplace from "./pages/Marketplace";
import Trade from "./pages/Trade";
import DeploymentDetail from "./pages/DeploymentDetail";
import Grove from "./pages/Grove";
import Earnings from "./pages/Earnings";
import Activity from "./pages/Activity";
import AgentLab from "./pages/AgentLab";
import Studio from "./pages/Studio";
import Leaderboards from "./pages/Leaderboards";
import DeployWizard from "./pages/DeployWizard";
import Trust from "./pages/Trust";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="trade" element={<Trade />} />
        <Route path="agents/:id" element={<DeploymentDetail />} />
        <Route path="studio" element={<Studio />} />
        <Route path="lab" element={<AgentLab />} />
        <Route path="grove" element={<Grove />} />
        <Route path="leaderboards" element={<Leaderboards />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="activity" element={<Activity />} />
        <Route path="deploy" element={<DeployWizard />} />
        <Route path="trust" element={<Trust />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
