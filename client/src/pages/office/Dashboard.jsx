// भूमिकेनुसार डॅशबोर्ड (RBAC): आयुक्त → शहर नियंत्रण कक्ष; अधिकारी → दैनंदिन कामांचा डॅशबोर्ड
import { useAuth } from '../../auth.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import OfficerDashboard from './OfficerDashboard.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  return user.role === 'admin' ? <AdminDashboard /> : <OfficerDashboard />;
}
