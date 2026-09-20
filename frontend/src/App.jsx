import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import TeacherDashboard from './pages/TeacherDashboard';
import AdminDashboard from './pages/AdminDashboard';
import StudentPortal from './pages/StudentPortal';

function MainApp() {
  const { user, loading } = useAuth();
  const [currentPage, setCurrentPage] = useState('landing');

  useEffect(() => {
    if (!loading) {
      if (user) {
        if (user.role === 'student') {
          setCurrentPage('student-portal');
        } else {
          setCurrentPage('teacher-dashboard');
        }
      } else {
        setCurrentPage('landing');
      }
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500 font-semibold">
        Initializing TISS Portal...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar onNavigate={setCurrentPage} currentPage={currentPage} />
      <main className="flex-grow">
        {!user && <LandingPage onNavigate={setCurrentPage} />}
        {user && user.role === 'student' && <StudentPortal />}
        {user && user.role !== 'student' && currentPage === 'teacher-dashboard' && <TeacherDashboard />}
        {user && user.role !== 'student' && currentPage === 'admin-students' && <AdminDashboard />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
