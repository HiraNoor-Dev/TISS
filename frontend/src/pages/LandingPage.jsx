import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { UserCheck, GraduationCap, Lock, User, Sparkles, School, ArrowRight, ShieldCheck } from 'lucide-react';

export default function LandingPage({ onNavigate }) {
  const { loginTeacher, loginStudent } = useAuth();

  const [activeModal, setActiveModal] = useState(null); // 'teacher' | 'student' | null

  // Teacher Login Form State
  const [teacherUser, setTeacherUser] = useState('');
  const [teacherPass, setTeacherPass] = useState('');
  const [teacherSection, setTeacherSection] = useState('junior');
  const [teacherError, setTeacherError] = useState('');
  const [teacherLoading, setTeacherLoading] = useState(false);

  // Student Login Form State
  const [studentRoll, setStudentRoll] = useState('');
  const [studentPass, setStudentPass] = useState('');
  const [studentError, setStudentError] = useState('');
  const [studentLoading, setStudentLoading] = useState(false);

  const handleTeacherSubmit = async (e) => {
    e.preventDefault();
    setTeacherError('');
    setTeacherLoading(true);
    try {
      await loginTeacher(teacherUser, teacherPass, teacherSection);
      setActiveModal(null);
      onNavigate('teacher-dashboard');
    } catch (err) {
      setTeacherError(err.response?.data?.error || 'Invalid credentials or login failed.');
    } finally {
      setTeacherLoading(false);
    }
  };

  const handleStudentSubmit = async (e) => {
    e.preventDefault();
    setStudentError('');
    setStudentLoading(true);
    try {
      await loginStudent(studentRoll, studentPass);
      setActiveModal(null);
      onNavigate('student-portal');
    } catch (err) {
      setStudentError(err.response?.data?.error || 'Invalid roll number or password.');
    } finally {
      setStudentLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col justify-between bg-gradient-to-b from-slate-50 via-sky-50/30 to-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto w-full text-center">
        
        {/* Header Badge */}
        <div className="inline-flex items-center space-x-2 bg-brand-50 border border-brand-200 text-brand-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 shadow-sm">
          <Sparkles className="w-4 h-4 text-brand-500" />
          <span>TISS Parent Communication & School Portal</span>
        </div>

        {/* Title */}
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight mb-4">
          Centralized School Management & Digital Parent Reporting
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-12">
          Effortlessly record test marks, attendance, cleanliness observations, and teacher remarks with instant WhatsApp report sharing for parents.
        </p>

        {/* Two Primary Options Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto text-left">
          
          {/* Card 1: Teacher Option */}
          <div 
            onClick={() => { setActiveModal('teacher'); setTeacherError(''); }}
            className="bg-white rounded-2xl border border-slate-200 p-8 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
            <div className="w-14 h-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-brand-500/30 relative z-10">
              <UserCheck className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2 relative z-10 flex items-center justify-between">
              <span>Teacher Portal</span>
              <ArrowRight className="w-5 h-5 text-brand-500 transform group-hover:translate-x-1 transition-transform" />
            </h2>
            <p className="text-slate-600 text-sm mb-6 relative z-10">
              Log in to manage assigned classes, enter test marks, take daily attendance, add cleanliness ratings, and send WhatsApp student reports.
            </p>
            <div className="inline-flex items-center text-xs font-bold text-brand-700 bg-brand-50 px-3 py-1.5 rounded-lg border border-brand-100">
              Select Section: Junior • Senior • Matric
            </div>
          </div>

          {/* Card 2: Student Option */}
          <div 
            onClick={() => { setActiveModal('student'); setStudentError(''); }}
            className="bg-white rounded-2xl border border-slate-200 p-8 shadow-md hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer group relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -mr-8 -mt-8 transition-transform group-hover:scale-110"></div>
            <div className="w-14 h-14 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-emerald-500/30 relative z-10">
              <GraduationCap className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2 relative z-10 flex items-center justify-between">
              <span>Student Portal</span>
              <ArrowRight className="w-5 h-5 text-emerald-500 transform group-hover:translate-x-1 transition-transform" />
            </h2>
            <p className="text-slate-600 text-sm mb-6 relative z-10">
              Log in using your assigned Roll Number (Portal ID) to view your test results, attendance history, cleanliness log, and teacher remarks.
            </p>
            <div className="inline-flex items-center text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">
              Use Roll No (e.g. P2101)
            </div>
          </div>

        </div>

        {/* Demo Login Shortcuts / Helper Note */}
        <div className="mt-12 bg-white/80 backdrop-blur border border-slate-200 rounded-2xl p-6 max-w-2xl mx-auto text-left shadow-sm">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-brand-600" />
            <span>Prototype Seed Accounts for Demonstration</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
            <div 
              onClick={() => {
                setActiveModal('teacher');
                setTeacherUser('fatima_t');
                setTeacherPass('password123');
                setTeacherSection('junior');
              }}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-brand-300 cursor-pointer"
            >
              <div className="font-semibold text-slate-800">Incharge Teacher</div>
              <div>User: <code className="text-brand-700">fatima_t</code></div>
              <div>Pass: <code className="text-slate-500">password123</code></div>
            </div>
            <div 
              onClick={() => {
                setActiveModal('teacher');
                setTeacherUser('ayesha_t');
                setTeacherPass('password123');
                setTeacherSection('senior');
              }}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-brand-300 cursor-pointer"
            >
              <div className="font-semibold text-slate-800">Senior Teacher</div>
              <div>User: <code className="text-brand-700">ayesha_t</code></div>
              <div>Pass: <code className="text-slate-500">password123</code></div>
            </div>
            <div 
              onClick={() => {
                setActiveModal('student');
                setStudentRoll('P2101');
                setStudentPass('password123');
              }}
              className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg hover:border-emerald-300 cursor-pointer"
            >
              <div className="font-semibold text-slate-800">Student Account</div>
              <div>Roll: <code className="text-emerald-700">P2101</code></div>
              <div>Pass: <code className="text-slate-500">password123</code></div>
            </div>
          </div>
        </div>

      </div>

      {/* --- TEACHER LOGIN MODAL --- */}
      {activeModal === 'teacher' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-100 relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setActiveModal(null)} 
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-brand-600 text-white flex items-center justify-center shadow-lg shadow-brand-500/30">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Teacher Login</h3>
                <p className="text-xs text-slate-500">Access your class and subject dashboard</p>
              </div>
            </div>

            {teacherError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                {teacherError}
              </div>
            )}

            <form onSubmit={handleTeacherSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Username</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={teacherUser}
                    onChange={(e) => setTeacherUser(e.target.value)}
                    placeholder="e.g. fatima_t"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={teacherPass}
                    onChange={(e) => setTeacherPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Section</label>
                <div className="relative">
                  <School className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <select
                    value={teacherSection}
                    onChange={(e) => setTeacherSection(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white font-medium"
                  >
                    <option value="junior">Junior Section (Grades 0 - 5)</option>
                    <option value="senior">Senior Section (Grades 6 - 8)</option>
                    <option value="matric">Matric Section (Grades 9 - 10)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={teacherLoading}
                className="w-full mt-2 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl shadow-lg shadow-brand-600/30 transition-all disabled:opacity-50"
              >
                {teacherLoading ? 'Authenticating...' : 'Sign In as Teacher'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- STUDENT LOGIN MODAL --- */}
      {activeModal === 'student' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-100 relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setActiveModal(null)} 
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900">Student Login</h3>
                <p className="text-xs text-slate-500">View test results, attendance & remarks</p>
              </div>
            </div>

            {studentError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                {studentError}
              </div>
            )}

            <form onSubmit={handleStudentSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Roll Number / Portal ID</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={studentRoll}
                    onChange={(e) => setStudentRoll(e.target.value)}
                    placeholder="e.g. P2101"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white uppercase font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    required
                    value={studentPass}
                    onChange={(e) => setStudentPass(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={studentLoading}
                className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition-all disabled:opacity-50"
              >
                {studentLoading ? 'Authenticating...' : 'Sign In as Student'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 mt-12">
        © 2026 TISS School Management & Parent Communication System
      </footer>
    </div>
  );
}
