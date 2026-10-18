import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import PublicComplaint from './pages/PublicComplaint.jsx';
import TrackComplaint from './pages/TrackComplaint.jsx';
import VerifyCertificate from './pages/VerifyCertificate.jsx';
import Notifications from './pages/Notifications.jsx';
import WorkerHome from './pages/worker/WorkerHome.jsx';
import Attendance from './pages/worker/Attendance.jsx';
import Tasks from './pages/worker/Tasks.jsx';
import TaskDetail from './pages/worker/TaskDetail.jsx';
import Dashboard from './pages/office/Dashboard.jsx';
import Grievances from './pages/office/Grievances.jsx';
import GrievanceDetail from './pages/office/GrievanceDetail.jsx';
import AttendanceReport from './pages/office/AttendanceReport.jsx';
import Approvals from './pages/office/Approvals.jsx';
import ApprovalDetail from './pages/office/ApprovalDetail.jsx';
import EFiles from './pages/office/EFiles.jsx';
import EFileDetail from './pages/office/EFileDetail.jsx';
import Fleet from './pages/office/Fleet.jsx';
import Users from './pages/office/Users.jsx';
import QuickAction from './pages/QuickAction.jsx';
import PublicTax from './pages/PublicTax.jsx';
import Training from './pages/Training.jsx';
import VoiceReport from './pages/worker/VoiceReport.jsx';
import MyStars from './pages/worker/MyStars.jsx';
import Leaderboard from './pages/office/Leaderboard.jsx';
import Reports from './pages/office/Reports.jsx';
import Tax from './pages/office/Tax.jsx';
import PropertyDetail from './pages/office/PropertyDetail.jsx';
import Receipt from './pages/office/Receipt.jsx';
import ClerkHome from './pages/office/ClerkHome.jsx';
import HrApprovals from './pages/office/HrApprovals.jsx';
import Leave from './pages/staff/Leave.jsx';
import Payslip from './pages/staff/Payslip.jsx';
import Notices from './pages/staff/Notices.jsx';
import Materials from './pages/staff/Materials.jsx';
import WorkOrders from './pages/staff/WorkOrders.jsx';
import WorkOrderDetail from './pages/staff/WorkOrderDetail.jsx';
import Directory from './pages/staff/Directory.jsx';
import Help from './pages/staff/Help.jsx';
import MeterReading from './pages/worker/MeterReading.jsx';
import { TankerTripDetail, TankerTripList } from './pages/worker/TankerTrips.jsx';
import WaterBill from './pages/staff/WaterBill.jsx';
import Water from './pages/office/Water.jsx';
import Defaulters from './pages/office/Defaulters.jsx';
import Advance from './pages/staff/Advance.jsx';
import Kanban from './pages/office/Kanban.jsx';
import Roster from './pages/office/Roster.jsx';
import Inspections from './pages/office/Inspections.jsx';
import Emergencies from './pages/office/Emergencies.jsx';
import Budget from './pages/office/Budget.jsx';

// सर्व कर्मचाऱ्यांसाठी समान पाने (कर्मचारी, लिपिक, अधिकारी, आयुक्त)
const staffRoutes = (
  <>
    <Route path="attendance" element={<Attendance />} />
    <Route path="leave" element={<Leave />} />
    <Route path="payslip" element={<Payslip />} />
    <Route path="notices" element={<Notices />} />
    <Route path="materials" element={<Materials />} />
    <Route path="work-orders" element={<WorkOrders />} />
    <Route path="work-orders/:id" element={<WorkOrderDetail />} />
    <Route path="directory" element={<Directory />} />
    <Route path="help" element={<Help />} />
    <Route path="advance" element={<Advance />} />
    <Route path="emergencies" element={<Emergencies />} />
    <Route path="water-bill/:id" element={<WaterBill />} />
    <Route path="notifications" element={<Notifications />} />
  </>
);

export default function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/complaint" element={<PublicComplaint />} />
      <Route path="/track" element={<TrackComplaint />} />
      <Route path="/verify" element={<VerifyCertificate />} />
      <Route path="/verify/:appNo" element={<VerifyCertificate />} />
      <Route path="/q/:token" element={<QuickAction />} />
      <Route path="/pay-tax" element={<PublicTax />} />
      <Route path="/training" element={<Training />} />

      {!user ? (
        <Route path="*" element={<Navigate to="/login" />} />
      ) : user.role === 'worker' ? (
        <Route element={<Layout />}>
          <Route index element={<WorkerHome />} />
          {staffRoutes}
          <Route path="tasks" element={<Tasks />} />
          <Route path="meter" element={<MeterReading />} />
          <Route path="tanker" element={<TankerTripList />} />
          <Route path="tanker/:id" element={<TankerTripDetail />} />
          <Route path="tasks/:id" element={<TaskDetail />} />
          <Route path="report" element={<VoiceReport />} />
          <Route path="my-stars" element={<MyStars />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      ) : user.role === 'clerk' ? (
        <Route element={<Layout />}>
          <Route index element={<ClerkHome />} />
          {staffRoutes}
          <Route path="grievances" element={<Grievances />} />
          <Route path="grievances/:id" element={<GrievanceDetail />} />
          <Route path="complaint/new" element={<PublicComplaint staff />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="approvals/:id" element={<ApprovalDetail />} />
          <Route path="tax" element={<Tax />} />
          <Route path="tax/:id" element={<PropertyDetail />} />
          <Route path="receipt/:id" element={<Receipt />} />
          <Route path="efiles" element={<EFiles />} />
          <Route path="efiles/:id" element={<EFileDetail />} />
          <Route path="water" element={<Water />} />
          <Route path="defaulters" element={<Defaulters />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          {staffRoutes}
          <Route path="approvals-hr" element={<HrApprovals />} />
          <Route path="kanban" element={<Kanban />} />
          <Route path="roster" element={<Roster />} />
          <Route path="inspections" element={<Inspections />} />
          <Route path="budget" element={<Budget />} />
          <Route path="water" element={<Water />} />
          <Route path="defaulters" element={<Defaulters />} />
          <Route path="grievances" element={<Grievances />} />
          <Route path="grievances/:id" element={<GrievanceDetail />} />
          <Route path="complaint/new" element={<PublicComplaint staff />} />
          <Route path="attendance-report" element={<AttendanceReport />} />
          <Route path="approvals" element={<Approvals />} />
          <Route path="approvals/:id" element={<ApprovalDetail />} />
          <Route path="efiles" element={<EFiles />} />
          <Route path="efiles/:id" element={<EFileDetail />} />
          <Route path="fleet" element={<Fleet />} />
          <Route path="tax" element={<Tax />} />
          <Route path="tax/:id" element={<PropertyDetail />} />
          <Route path="receipt/:id" element={<Receipt />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="reports" element={<Reports />} />
          {user.role === 'admin' && <Route path="users" element={<Users />} />}
          <Route path="tasks/:id" element={<Navigate to="/grievances" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      )}
    </Routes>
  );
}
