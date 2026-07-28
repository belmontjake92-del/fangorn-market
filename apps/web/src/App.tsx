import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import Overview from "./pages/Overview";
import Marketplace from "./pages/Marketplace";
import DeploymentDetail from "./pages/DeploymentDetail";
import Grove from "./pages/Grove";
import Earnings from "./pages/Earnings";
import Activity from "./pages/Activity";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Overview />} />
        <Route path="marketplace" element={<Marketplace />} />
        <Route path="agents/:id" element={<DeploymentDetail />} />
        <Route path="grove" element={<Grove />} />
        <Route path="earnings" element={<Earnings />} />
        <Route path="activity" element={<Activity />} />
      </Route>
    </Routes>
  );
}
