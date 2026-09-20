import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import WhatsAppModal from '../components/WhatsAppModal';
import { 
  Plus, CheckCircle, Award, Calendar, Sparkles, MessageSquare, 
  FileText, Send, UserCheck, AlertCircle, Save, Check, RefreshCw
} from 'lucide-react';

export default function TeacherDashboard() {
  const { user } = useAuth();

  // State
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [activeTab, setActiveTab] = useState('marks'); // 'marks' | 'attendance' | 'cleanliness' | 'remarks' | 'reports'

  // Add Class Modal State
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [allClasses, setAllClasses] = useState([]);
  const [addClassId, setAddClassId] = useState('');
  const [addSubjectName, setAddSubjectName] = useState('');
  const [addClassError, setAddClassError] = useState('');
  const [addClassLoading, setAddClassLoading] = useState(false);

  // Roster & Class Students
  const [students, setStudents] = useState([]);

  // --- MODULE 1: TESTS & MARKS ---
  const [tests, setTests] = useState([]);
  const [selectedTestId, setSelectedTestId] = useState('');
  const [testResults, setTestResults] = useState([]);
  const [isCreateTestOpen, setIsCreateTestOpen] = useState(false);
  const [newTestTitle, setNewTestTitle] = useState('');
  const [newTestMarks, setNewTestMarks] = useState('25');
  const [newTestDate, setNewTestDate] = useState(new Date().toISOString().split('T')[0]);
  const [marksStatusMsg, setMarksStatusMsg] = useState('');

  // --- MODULE 2: ATTENDANCE ---
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceMap, setAttendanceMap] = useState({}); // { student_id: 'present' | 'absent' }
  const [attendanceStatusMsg, setAttendanceStatusMsg] = useState('');

  // --- MODULE 3: CLEANLINESS ---
  const [cleanlinessDate, setCleanlinessDate] = useState(new Date().toISOString().split('T')[0]);
  const [cleanlinessMap, setCleanlinessMap] = useState({}); // { student_id: { status, notes } }
  const [cleanlinessStatusMsg, setCleanlinessStatusMsg] = useState('');

  // --- MODULE 4: REMARKS ---
  const [remarkStudentId, setRemarkStudentId] = useState('');
  const [remarkCategory, setRemarkCategory] = useState('Academic');
  const [remarkText, setRemarkText] = useState('');
  const [remarkStatusMsg, setRemarkStatusMsg] = useState('');

  // --- MODULE 5: OVERALL REPORTS ---
  const [selectedReportStudentId, setSelectedReportStudentId] = useState('');
  const [reportData, setReportData] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [whatsappModalData, setWhatsappModalData] = useState(null);

  // Fetch Teacher Assignments & Classes
  useEffect(() => {
    fetchAssignments();
    fetchAllClasses();
  }, []);

  const fetchAssignments = async () => {
    try {
      const res = await api.get('/classes/my-assignments');
      setAssignments(res.data.assignments);
      if (res.data.assignments.length > 0) {
        setSelectedAssignment(res.data.assignments[0]);
      }
    } catch (err) {
      console.error('Failed to load assignments:', err);
    }
  };

  const fetchAllClasses = async () => {
    try {
      const res = await api.get('/classes/all');
      setAllClasses(res.data.classes);
      if (res.data.classes.length > 0) {
        setAddClassId(res.data.classes[0].id);
      }
    } catch (err) {
      console.error('Failed to load classes:', err);
    }
  };

  // Fetch Class Roster when Selected Assignment changes
  useEffect(() => {
    if (selectedAssignment) {
      fetchStudents(selectedAssignment.class_id);
    }
  }, [selectedAssignment]);

  const fetchStudents = async (classId) => {
    try {
      const res = await api.get(`/students/class/${classId}`);
      setStudents(res.data.students);
      if (res.data.students.length > 0) {
        setRemarkStudentId(res.data.students[0].id);
        setSelectedReportStudentId(res.data.students[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch students:', err);
    }
  };

  // --- ADD CLASS ASSIGNMENT ---
  const handleAddClassSubmit = async (e) => {
    e.preventDefault();
    setAddClassError('');
    setAddClassLoading(true);
    try {
      await api.post('/classes/assign', {
        class_id: addClassId,
        subject_name: addSubjectName
      });
      setIsAddClassOpen(false);
      setAddSubjectName('');
      await fetchAssignments();
    } catch (err) {
      setAddClassError(err.response?.data?.error || 'Failed to add class assignment.');
    } finally {
      setAddClassLoading(false);
    }
  };

  // --- MARKS LOGIC ---
  useEffect(() => {
    if (selectedAssignment && activeTab === 'marks') {
      fetchTests();
    }
  }, [selectedAssignment, activeTab]);

  const fetchTests = async () => {
    if (!selectedAssignment) return;
    try {
      const res = await api.get(`/marks/tests?class_id=${selectedAssignment.class_id}&subject_name=${encodeURIComponent(selectedAssignment.subject_name)}`);
      setTests(res.data.tests);
      if (res.data.tests.length > 0) {
        setSelectedTestId(res.data.tests[0].id);
      } else {
        setSelectedTestId('');
        setTestResults([]);
      }
    } catch (err) {
      console.error('Error fetching tests:', err);
    }
  };

  useEffect(() => {
    if (selectedTestId && activeTab === 'marks') {
      fetchTestResults(selectedTestId);
    }
  }, [selectedTestId, activeTab]);

  const fetchTestResults = async (testId) => {
    try {
      const res = await api.get(`/marks/results/${testId}`);
      setTestResults(res.data.results);
    } catch (err) {
      console.error('Error fetching test results:', err);
    }
  };

  const handleCreateTest = async (e) => {
    e.preventDefault();
    if (!selectedAssignment) return;
    try {
      const res = await api.post('/marks/tests', {
        title: newTestTitle,
        subject_name: selectedAssignment.subject_name,
        class_id: selectedAssignment.class_id,
        total_marks: newTestMarks,
        test_date: newTestDate
      });
      setIsCreateTestOpen(false);
      setNewTestTitle('');
      await fetchTests();
      setSelectedTestId(res.data.test_id);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to create test');
    }
  };

  const handleMarksChange = (studentId, val) => {
    setTestResults(prev => prev.map(r => r.student_id === studentId ? { ...r, marks_obtained: val } : r));
  };

  const handleSaveMarks = async () => {
    if (!selectedTestId) return;
    try {
      await api.post('/marks/results/save', {
        test_id: selectedTestId,
        results: testResults.map(r => ({
          student_id: r.student_id,
          marks_obtained: r.marks_obtained,
          remarks: r.remarks
        }))
      });
      setMarksStatusMsg('Test marks saved successfully!');
      setTimeout(() => setMarksStatusMsg(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save marks');
    }
  };

  // --- ATTENDANCE LOGIC ---
  useEffect(() => {
    if (selectedAssignment && activeTab === 'attendance') {
      fetchAttendance();
    }
  }, [selectedAssignment, attendanceDate, activeTab]);

  const fetchAttendance = async () => {
    if (!selectedAssignment) return;
    try {
      const res = await api.get(`/attendance?class_id=${selectedAssignment.class_id}&date=${attendanceDate}`);
      const map = {};
      res.data.roster.forEach(r => {
        map[r.student_id] = r.attendance_status || 'present';
      });
      setAttendanceMap(map);
    } catch (err) {
      console.error('Error fetching attendance:', err);
    }
  };

  const handleMarkAllPresent = () => {
    const map = {};
    students.forEach(s => {
      map[s.id] = 'present';
    });
    setAttendanceMap(map);
  };

  const handleSaveAttendance = async () => {
    if (!selectedAssignment) return;
    try {
      const records = Object.keys(attendanceMap).map(sId => ({
        student_id: parseInt(sId),
        status: attendanceMap[sId]
      }));
      await api.post('/attendance/save', {
        class_id: selectedAssignment.class_id,
        date: attendanceDate,
        records
      });
      setAttendanceStatusMsg('Attendance saved successfully!');
      setTimeout(() => setAttendanceStatusMsg(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save attendance');
    }
  };

  // --- CLEANLINESS LOGIC ---
  useEffect(() => {
    if (selectedAssignment && activeTab === 'cleanliness') {
      fetchCleanliness();
    }
  }, [selectedAssignment, cleanlinessDate, activeTab]);

  const fetchCleanliness = async () => {
    if (!selectedAssignment) return;
    try {
      const res = await api.get(`/cleanliness?class_id=${selectedAssignment.class_id}&date=${cleanlinessDate}`);
      const map = {};
      res.data.records.forEach(r => {
        map[r.student_id] = {
          status: r.status || 'Neat',
          notes: r.notes || ''
        };
      });
      setCleanlinessMap(map);
    } catch (err) {
      console.error('Error fetching cleanliness:', err);
    }
  };

  const handleSaveCleanliness = async () => {
    if (!selectedAssignment) return;
    try {
      const records = Object.keys(cleanlinessMap).map(sId => ({
        student_id: parseInt(sId),
        status: cleanlinessMap[sId].status,
        notes: cleanlinessMap[sId].notes
      }));
      await api.post('/cleanliness/save', {
        class_id: selectedAssignment.class_id,
        date: cleanlinessDate,
        records
      });
      setCleanlinessStatusMsg('Cleanliness observations saved successfully!');
      setTimeout(() => setCleanlinessStatusMsg(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save cleanliness records');
    }
  };

  // --- REMARKS LOGIC ---
  const handleSaveRemark = async (e) => {
    e.preventDefault();
    if (!remarkStudentId || !remarkText.trim()) return;
    try {
      await api.post('/remarks/add', {
        student_id: remarkStudentId,
        category: remarkCategory,
        remark_text: remarkText
      });
      setRemarkText('');
      setRemarkStatusMsg('Remark added successfully!');
      setTimeout(() => setRemarkStatusMsg(''), 3000);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to save remark');
    }
  };

  // --- OVERALL STUDENT REPORT LOGIC ---
  useEffect(() => {
    if (selectedReportStudentId && activeTab === 'reports') {
      fetchStudentReport(selectedReportStudentId);
    }
  }, [selectedReportStudentId, activeTab]);

  const fetchStudentReport = async (studentId) => {
    setReportLoading(true);
    try {
      const res = await api.get(`/reports/student/${studentId}`);
      setReportData(res.data);
    } catch (err) {
      console.error('Failed to fetch report:', err);
    } finally {
      setReportLoading(false);
    }
  };

  const handleGenerateWhatsAppLink = async () => {
    if (!selectedReportStudentId) return;
    try {
      const res = await api.get(`/reports/whatsapp-link/${selectedReportStudentId}`);
      setWhatsappModalData(res.data);
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to generate WhatsApp report link');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Dashboard Top Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-brand-700 bg-brand-50 px-2.5 py-1 rounded-md border border-brand-100">
              Teacher Dashboard
            </span>
            {user?.is_incharge === 1 && (
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center space-x-1">
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Class Incharge</span>
              </span>
            )}
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Welcome, {user?.full_name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Select your assigned class and subject to manage student records.</p>
        </div>

        {/* Class Selection / Add Class */}
        <div className="flex items-center space-x-3">
          {assignments.length > 0 ? (
            <div className="flex items-center space-x-2">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:inline">Active Class:</label>
              <select
                value={selectedAssignment?.assignment_id || ''}
                onChange={(e) => {
                  const assign = assignments.find(a => a.assignment_id === parseInt(e.target.value));
                  setSelectedAssignment(assign);
                }}
                className="bg-slate-50 border border-slate-300 font-bold text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                {assignments.map(a => (
                  <option key={a.assignment_id} value={a.assignment_id}>
                    {a.class_name} → {a.subject_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-xl font-medium border border-amber-200">
              No assigned classes yet. Click "Add Class" to start!
            </div>
          )}

          <button
            onClick={() => setIsAddClassOpen(true)}
            className="py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-600/30 flex items-center space-x-2 transition-all whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Add Class</span>
          </button>
        </div>
      </div>

      {/* Module Tabs Navigation */}
      {selectedAssignment ? (
        <>
          <div className="flex border-b border-slate-200 mb-8 overflow-x-auto space-x-2">
            {[
              { id: 'marks', label: 'Tests & Marks', icon: Award },
              { id: 'attendance', label: 'Attendance', icon: Calendar },
              { id: 'cleanliness', label: 'Cleanliness', icon: Sparkles },
              { id: 'remarks', label: 'Teacher Remarks', icon: MessageSquare },
              { id: 'reports', label: 'Overall Student Report & WhatsApp', icon: FileText }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-4 px-4 text-sm font-bold flex items-center space-x-2 border-b-2 transition-all whitespace-nowrap ${
                    isActive 
                      ? 'border-brand-600 text-brand-700 font-extrabold' 
                      : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-brand-600' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: TESTS & MARKS */}
          {activeTab === 'marks' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Marks Entry ({selectedAssignment.class_name} • {selectedAssignment.subject_name})</h2>
                  <p className="text-xs text-slate-500">Create or select a test to enter student scores.</p>
                </div>

                <div className="flex items-center space-x-3">
                  {tests.length > 0 && (
                    <select
                      value={selectedTestId}
                      onChange={(e) => setSelectedTestId(parseInt(e.target.value))}
                      className="bg-slate-50 border border-slate-300 font-semibold text-slate-800 text-sm rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {tests.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.title} ({t.test_date}) - Total: {t.total_marks} Marks
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    onClick={() => setIsCreateTestOpen(true)}
                    className="py-2 px-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs flex items-center space-x-1.5 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Test</span>
                  </button>
                </div>
              </div>

              {marksStatusMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{marksStatusMsg}</span>
                </div>
              )}

              {selectedTestId && testResults.length > 0 ? (
                <div>
                  <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-6">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                          <th className="py-3 px-4">Roll No</th>
                          <th className="py-3 px-4">Student Name</th>
                          <th className="py-3 px-4">Obtained Marks</th>
                          <th className="py-3 px-4">Percentage</th>
                          <th className="py-3 px-4">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {testResults.map(r => {
                          const testObj = tests.find(t => t.id === selectedTestId);
                          const total = testObj ? testObj.total_marks : 25;
                          const marksVal = r.marks_obtained !== null && r.marks_obtained !== undefined ? r.marks_obtained : '';
                          const pct = marksVal !== '' && !isNaN(marksVal) ? ((parseFloat(marksVal) / total) * 100).toFixed(1) : '-';
                          return (
                            <tr key={r.student_id} className="hover:bg-slate-50/80">
                              <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.roll_number}</td>
                              <td className="py-3 px-4 font-semibold text-slate-800">{r.student_name}</td>
                              <td className="py-3 px-4">
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max={total}
                                    value={marksVal}
                                    onChange={(e) => handleMarksChange(r.student_id, e.target.value)}
                                    placeholder={`0 - ${total}`}
                                    className="w-24 px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
                                  />
                                  <span className="text-xs text-slate-400 font-medium">/ {total}</span>
                                </div>
                              </td>
                              <td className="py-3 px-4 font-bold text-brand-700">
                                {pct !== '-' ? `${pct}%` : '-'}
                              </td>
                              <td className="py-3 px-4">
                                <input
                                  type="text"
                                  value={r.remarks || ''}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setTestResults(prev => prev.map(item => item.student_id === r.student_id ? { ...item, remarks: val } : item));
                                  }}
                                  placeholder="Optional remark"
                                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveMarks}
                      className="py-2.5 px-6 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-600/30 flex items-center space-x-2 transition-all"
                    >
                      <Save className="w-4 h-4" />
                      <span>Save Marks</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400">
                  <Award className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-600">No test selected or created for this subject yet.</p>
                  <p className="text-xs mt-1">Click "New Test" above to create an evaluation.</p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Daily Attendance ({selectedAssignment.class_name})</h2>
                  <p className="text-xs text-slate-500">Record present and absent status for students on the selected date.</p>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Date:</label>
                    <input
                      type="date"
                      value={attendanceDate}
                      onChange={(e) => setAttendanceDate(e.target.value)}
                      className="bg-slate-50 border border-slate-300 font-semibold text-slate-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <button
                    onClick={handleMarkAllPresent}
                    className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-xl text-xs border border-emerald-200 flex items-center space-x-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Mark All Present</span>
                  </button>
                </div>
              </div>

              {attendanceStatusMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{attendanceStatusMsg}</span>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                      <th className="py-3 px-4">Roll No</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {students.map(s => {
                      const status = attendanceMap[s.id] || 'present';
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.roll_number}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{s.name}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center space-x-3">
                              <button
                                type="button"
                                onClick={() => setAttendanceMap(prev => ({ ...prev, [s.id]: 'present' }))}
                                className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${
                                  status === 'present'
                                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                Present
                              </button>
                              <button
                                type="button"
                                onClick={() => setAttendanceMap(prev => ({ ...prev, [s.id]: 'absent' }))}
                                className={`px-4 py-1.5 rounded-xl font-bold text-xs transition-all ${
                                  status === 'absent'
                                    ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                              >
                                Absent
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveAttendance}
                  className="py-2.5 px-6 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-600/30 flex items-center space-x-2 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Attendance</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: CLEANLINESS */}
          {activeTab === 'cleanliness' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Cleanliness Observations ({selectedAssignment.class_name})</h2>
                  <p className="text-xs text-slate-500">Record daily cleanliness ratings for students.</p>
                </div>

                <div className="flex items-center space-x-2">
                  <label className="text-xs font-bold text-slate-500 uppercase">Date:</label>
                  <input
                    type="date"
                    value={cleanlinessDate}
                    onChange={(e) => setCleanlinessDate(e.target.value)}
                    className="bg-slate-50 border border-slate-300 font-semibold text-slate-800 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {cleanlinessStatusMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{cleanlinessStatusMsg}</span>
                </div>
              )}

              <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-6">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                      <th className="py-3 px-4">Roll No</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Cleanliness Rating</th>
                      <th className="py-3 px-4">Observation Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {students.map(s => {
                      const item = cleanlinessMap[s.id] || { status: 'Neat', notes: '' };
                      return (
                        <tr key={s.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{s.roll_number}</td>
                          <td className="py-3 px-4 font-semibold text-slate-800">{s.name}</td>
                          <td className="py-3 px-4">
                            <select
                              value={item.status}
                              onChange={(e) => setCleanlinessMap(prev => ({
                                ...prev,
                                [s.id]: { ...item, status: e.target.value }
                              }))}
                              className="bg-slate-50 border border-slate-300 font-semibold text-slate-800 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            >
                              <option value="Neat">✨ Neat</option>
                              <option value="Needs Improvement">⚠️ Needs Improvement</option>
                              <option value="Poor">❌ Poor</option>
                            </select>
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={item.notes}
                              onChange={(e) => setCleanlinessMap(prev => ({
                                ...prev,
                                [s.id]: { ...item, notes: e.target.value }
                              }))}
                              placeholder="e.g. Uniform neat, shoes clean"
                              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveCleanliness}
                  className="py-2.5 px-6 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-600/30 flex items-center space-x-2 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Cleanliness Records</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: TEACHER REMARKS */}
          {activeTab === 'remarks' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm max-w-2xl mx-auto">
              <h2 className="text-xl font-bold text-slate-900 mb-1">Add Teacher Remark / Complaint</h2>
              <p className="text-xs text-slate-500 mb-6">Record specific academic, behavior, or general observations for a student.</p>

              {remarkStatusMsg && (
                <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>{remarkStatusMsg}</span>
                </div>
              )}

              <form onSubmit={handleSaveRemark} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Select Student</label>
                  <select
                    value={remarkStudentId}
                    onChange={(e) => setRemarkStudentId(parseInt(e.target.value))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {students.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.roll_number} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Category</label>
                  <select
                    value={remarkCategory}
                    onChange={(e) => setRemarkCategory(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="Academic">Academic Performance</option>
                    <option value="Homework incomplete">Homework incomplete</option>
                    <option value="Handwriting improvement">Needs improvement in handwriting</option>
                    <option value="Behavior">Behavior / Discipline</option>
                    <option value="General">General Remark</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Remark Description</label>
                  <textarea
                    rows={4}
                    required
                    value={remarkText}
                    onChange={(e) => setRemarkText(e.target.value)}
                    placeholder="Enter teacher observation or remark..."
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-600/30 flex items-center justify-center space-x-2 transition-all"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Remark</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 5: OVERALL STUDENT REPORT & WHATSAPP */}
          {activeTab === 'reports' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-200">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Overall Student Performance Report</h2>
                  <p className="text-xs text-slate-500">Comprehensive summary of academic results, attendance, cleanliness, and remarks.</p>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="flex items-center space-x-2">
                    <label className="text-xs font-bold text-slate-500 uppercase">Select Student:</label>
                    <select
                      value={selectedReportStudentId}
                      onChange={(e) => setSelectedReportStudentId(parseInt(e.target.value))}
                      className="bg-slate-50 border border-slate-300 font-bold text-slate-800 text-sm rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {students.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.roll_number} - {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleGenerateWhatsAppLink}
                    className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md shadow-emerald-600/30 flex items-center space-x-2 transition-all"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send Report on WhatsApp</span>
                  </button>
                </div>
              </div>

              {/* Report Render */}
              {reportLoading ? (
                <div className="py-12 text-center text-slate-400 font-semibold">Loading report...</div>
              ) : reportData ? (
                <div className="space-y-6">
                  
                  {/* Student Overview Header Card */}
                  <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row justify-between gap-6">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-brand-400 bg-brand-950 px-2.5 py-1 rounded-md border border-brand-800">
                        {reportData.student.class_name}
                      </span>
                      <h3 className="text-2xl font-extrabold mt-2">{reportData.student.name}</h3>
                      <p className="text-xs text-slate-400 mt-1">
                        Roll No: <span className="font-mono text-slate-200 font-bold">{reportData.student.roll_number}</span> | Parent WhatsApp: <span className="text-emerald-400 font-semibold">{reportData.student.parent_phone}</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 border-t md:border-t-0 md:border-l border-slate-800 pt-4 md:pt-0 md:pl-6 text-center">
                      <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                        <div className="text-xs text-slate-400 font-medium uppercase">Attendance</div>
                        <div className="text-xl font-black text-emerald-400 mt-0.5">{reportData.attendance.percentage}%</div>
                        <div className="text-[10px] text-slate-400">{reportData.attendance.present_days}/{reportData.attendance.total_days} Days</div>
                      </div>

                      <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700">
                        <div className="text-xs text-slate-400 font-medium uppercase">Overall Academic</div>
                        <div className="text-xl font-black text-brand-400 mt-0.5">{reportData.academic.overall_percentage}%</div>
                        <div className="text-[10px] text-slate-400">{reportData.academic.total_obtained}/{reportData.academic.total_max} Marks</div>
                      </div>

                      <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700 col-span-2 sm:col-span-1">
                        <div className="text-xs text-slate-400 font-medium uppercase">Cleanliness</div>
                        <div className="text-base font-bold text-amber-300 mt-1">{reportData.cleanliness.latest}</div>
                      </div>
                    </div>
                  </div>

                  {/* Grid for Academic Results & Remarks */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    
                    {/* Academic Tests */}
                    <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                      <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center space-x-2">
                        <Award className="w-4 h-4 text-brand-600" />
                        <span>Test Results & Subject Scores</span>
                      </h4>

                      {reportData.academic.results.length > 0 ? (
                        <div className="space-y-2.5">
                          {reportData.academic.results.map((r, idx) => {
                            const pct = ((r.marks_obtained / r.total_marks) * 100).toFixed(1);
                            return (
                              <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200 flex justify-between items-center shadow-2xs">
                                <div>
                                  <div className="font-bold text-slate-800 text-sm">{r.subject_name}</div>
                                  <div className="text-xs text-slate-500">{r.test_title} ({r.test_date})</div>
                                </div>
                                <div className="text-right">
                                  <div className="font-extrabold text-brand-700 text-base">{r.marks_obtained} / {r.total_marks}</div>
                                  <div className="text-xs font-semibold text-slate-500">{pct}%</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 py-4">No test records available yet.</p>
                      )}
                    </div>

                    {/* Teacher Remarks & Cleanliness Log */}
                    <div className="space-y-6">
                      
                      {/* Teacher Remarks */}
                      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                        <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center space-x-2">
                          <MessageSquare className="w-4 h-4 text-brand-600" />
                          <span>Teacher Remarks & Complaints</span>
                        </h4>

                        {reportData.remarks.length > 0 ? (
                          <div className="space-y-2.5">
                            {reportData.remarks.map((rm, idx) => (
                              <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                                <div className="flex justify-between items-center text-xs mb-1">
                                  <span className="font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded">{rm.category}</span>
                                  <span className="text-slate-400 font-medium">{rm.date}</span>
                                </div>
                                <p className="text-xs text-slate-700 font-medium leading-relaxed">{rm.remark_text}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 py-4">No teacher remarks recorded for this student.</p>
                        )}
                      </div>

                    </div>

                  </div>

                </div>
              ) : (
                <div className="py-12 text-center text-slate-400">Select a student above to generate report.</div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center">
          <AlertCircle className="w-12 h-12 mx-auto text-amber-500 mb-3" />
          <h3 className="text-xl font-bold text-slate-900 mb-2">No Active Class Selected</h3>
          <p className="text-slate-600 max-w-md mx-auto mb-6 text-sm">
            Please click "Add Class" above to add a class and subject to your teaching dashboard.
          </p>
          <button
            onClick={() => setIsAddClassOpen(true)}
            className="py-3 px-6 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-brand-600/30 inline-flex items-center space-x-2"
          >
            <Plus className="w-5 h-5" />
            <span>Add Class & Subject</span>
          </button>
        </div>
      )}

      {/* --- ADD CLASS MODAL --- */}
      {isAddClassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-100 relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setIsAddClassOpen(null)} 
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>
            
            <h3 className="text-xl font-bold text-slate-900 mb-1">Add Class to Dashboard</h3>
            <p className="text-xs text-slate-500 mb-6">Select a class and type the subject you teach for that class.</p>

            {addClassError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                {addClassError}
              </div>
            )}

            <form onSubmit={handleAddClassSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Select Class</label>
                <select
                  value={addClassId}
                  onChange={(e) => setAddClassId(parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {allClasses.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.section_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Subject Name</label>
                <input
                  type="text"
                  required
                  value={addSubjectName}
                  onChange={(e) => setAddSubjectName(e.target.value)}
                  placeholder="e.g. English, Mathematics, Computer Science..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">Teachers have full freedom to add any subject name.</span>
              </div>

              <button
                type="submit"
                disabled={addClassLoading}
                className="w-full mt-2 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-600/30 transition-all disabled:opacity-50"
              >
                {addClassLoading ? 'Assigning...' : 'Add Class & Subject'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATE TEST MODAL --- */}
      {isCreateTestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-100 relative">
            <button 
              onClick={() => setIsCreateTestOpen(false)} 
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>
            
            <h3 className="text-xl font-bold text-slate-900 mb-1">Create Evaluation / Test</h3>
            <p className="text-xs text-slate-500 mb-6">Subject: {selectedAssignment?.subject_name} ({selectedAssignment?.class_name})</p>

            <form onSubmit={handleCreateTest} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Test Title</label>
                <input
                  type="text"
                  required
                  value={newTestTitle}
                  onChange={(e) => setNewTestTitle(e.target.value)}
                  placeholder="e.g. Monthly Test 1, Midterm Quiz..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Total Marks</label>
                <input
                  type="number"
                  required
                  min="1"
                  value={newTestMarks}
                  onChange={(e) => setNewTestMarks(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Test Date</label>
                <input
                  type="date"
                  required
                  value={newTestDate}
                  onChange={(e) => setNewTestDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-xl text-sm shadow-md shadow-brand-600/30 transition-all"
              >
                Create Test
              </button>
            </form>
          </div>
        </div>
      )}

      {/* WhatsApp Modal */}
      <WhatsAppModal
        isOpen={!!whatsappModalData}
        onClose={() => setWhatsappModalData(null)}
        reportData={whatsappModalData}
      />

    </div>
  );
}
