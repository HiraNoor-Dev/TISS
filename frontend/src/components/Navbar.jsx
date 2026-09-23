import React from 'react';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, LogOut, UserCheck, Shield, BookOpen } from 'lucide-react';

export default function Navbar({ onNavigate, currentPage }) {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Brand Logo */}
          <div 
            onClick={() => onNavigate(user ? (user.role === 'student' ? 'student-portal' : 'teacher-dashboard') : 'landing')} 
            className="flex items-center space-x-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <span className="font-extrabold text-xl text-slate-900 tracking-tight block leading-none">TISS</span>
              <span className="text-xs font-semibold text-brand-600 tracking-wider uppercase block mt-0.5">School Management</span>
            </div>
          </div>

          {/* Right Navigation / User Status */}
          <div className="flex items-center space-x-4">
            {user ? (
              <div className="flex items-center space-x-3">
                {/* Navigation links for teacher/admin */}
                {user.role !== 'student' && (
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl text-sm font-medium mr-2">
                    <button
                      onClick={() => onNavigate('teacher-dashboard')}
                      className={`px-3 py-1.5 rounded-lg transition-all ${currentPage === 'teacher-dashboard' ? 'bg-white text-brand-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Teaching Dashboard
                    </button>
                    {(user.role === 'admin' || user.is_incharge === 1) && (
                      <button
                        onClick={() => onNavigate('admin-students')}
                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center space-x-1.5 ${currentPage === 'admin-students' ? 'bg-white text-brand-700 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-900'}`}
                      >
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        <span>Manage Students</span>
                      </button>
                    )}
                  </div>
                )}

                {/* User Info Badge */}
                <div className="hidden sm:flex items-center space-x-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-sm">
                  <div className="text-right">
                    <div className="font-semibold text-slate-800 leading-tight">{user.full_name}</div>
                    <div className="text-xs text-slate-500 flex items-center justify-end space-x-1">
                      {user.role === 'admin' ? (
                        <span className="bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded text-[10px]">ADMIN</span>
                      ) : user.role === 'student' ? (
                        <span className="bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded text-[10px]">STUDENT ({user.roll_number})</span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[10px]">
                          TEACHER {user.is_incharge ? '• INCHARGE' : ''}
                        </span>
                      )}
                      {user.section_code && (
                        <span className="capitalize font-medium text-slate-500">({user.section_code})</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Logout Button */}
                <button
                  onClick={() => {
                    logout();
                    onNavigate('landing');
                  }}
                  className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  title="Log out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <div className="text-sm font-medium text-slate-500">
                School Management & Parent Portal
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
