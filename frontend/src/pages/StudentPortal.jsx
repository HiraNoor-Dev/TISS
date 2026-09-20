import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { GraduationCap, Award, Calendar, Sparkles, MessageSquare, CheckCircle, ShieldCheck } from 'lucide-react';

export default function StudentPortal() {
  const { user } = useAuth();
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.student_id) {
      fetchStudentData(user.student_id);
    }
  }, [user]);

  const fetchStudentData = async (studentId) => {
    setLoading(true);
    try {
      const res = await api.get(`/reports/student/${studentId}`);
      setReportData(res.data);
    } catch (err) {
      console.error('Failed to load student portal data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center text-slate-400 font-semibold">
        Loading student portal...
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center text-slate-500">
        Unable to load student information.
      </div>
    );
  }

  const { student, attendance, academic, cleanliness, remarks } = reportData;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Student Welcome Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <div className="inline-flex items-center space-x-1.5 bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-lg text-xs font-bold border border-emerald-500/30 mb-3">
              <GraduationCap className="w-4 h-4" />
              <span>Student Portal Account</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">{student.name}</h1>
            <p className="text-sm text-slate-300 mt-1">
              Roll No: <span className="font-mono text-emerald-400 font-bold">{student.roll_number}</span> • Class: <span className="font-semibold text-white">{student.class_name}</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 w-full md:w-auto text-center">
            <div className="px-3">
              <div className="text-[10px] text-slate-300 uppercase font-bold">Attendance</div>
              <div className="text-xl font-black text-emerald-400 mt-0.5">{attendance.percentage}%</div>
            </div>
            <div className="px-3 border-x border-white/10">
              <div className="text-[10px] text-slate-300 uppercase font-bold">Academic</div>
              <div className="text-xl font-black text-brand-300 mt-0.5">{academic.overall_percentage}%</div>
            </div>
            <div className="px-3">
              <div className="text-[10px] text-slate-300 uppercase font-bold">Cleanliness</div>
              <div className="text-xs font-bold text-amber-300 mt-1">{cleanliness.latest}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Grid of Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Test Results */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-100">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Test & Exam Results</h2>
              <p className="text-xs text-slate-500">Your recent test marks and evaluations</p>
            </div>
          </div>

          {academic.results.length > 0 ? (
            <div className="space-y-3">
              {academic.results.map((r, idx) => {
                const pct = ((r.marks_obtained / r.total_marks) * 100).toFixed(1);
                return (
                  <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex justify-between items-center">
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{r.subject_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{r.test_title} • {r.test_date}</div>
                      {r.result_remarks && (
                        <div className="text-xs text-brand-700 italic mt-1">"{r.result_remarks}"</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-brand-700 text-lg">{r.marks_obtained} <span className="text-xs text-slate-400 font-normal">/ {r.total_marks}</span></div>
                      <div className="text-xs font-bold text-slate-600">{pct}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-6 text-center">No test results recorded yet.</p>
          )}
        </div>

        {/* Teacher Remarks & Cleanliness */}
        <div className="space-y-8">
          
          {/* Remarks */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Teacher Remarks</h2>
                <p className="text-xs text-slate-500">Feedback and observations from your teachers</p>
              </div>
            </div>

            {remarks.length > 0 ? (
              <div className="space-y-3">
                {remarks.map((rm, idx) => (
                  <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-bold text-purple-800 bg-purple-100 px-2.5 py-0.5 rounded-md">{rm.category}</span>
                      <span className="text-slate-400 font-medium">{rm.date}</span>
                    </div>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">{rm.remark_text}</p>
                    <div className="text-[10px] text-slate-400 mt-2 font-semibold">Teacher: {rm.teacher_name}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-6 text-center">No teacher remarks recorded yet.</p>
            )}
          </div>

          {/* Cleanliness History */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <div className="flex items-center space-x-3 mb-4 pb-4 border-b border-slate-100">
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Cleanliness Log</h2>
                <p className="text-xs text-slate-500">Uniform & hygiene observation history</p>
              </div>
            </div>

            {cleanliness.history.length > 0 ? (
              <div className="space-y-2">
                {cleanliness.history.map((c, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200/60 text-xs">
                    <span className="font-semibold text-slate-700">{c.date}</span>
                    <span className={`font-bold px-2.5 py-0.5 rounded-md ${
                      c.status === 'Neat' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-4 text-center">No cleanliness records recorded yet.</p>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
