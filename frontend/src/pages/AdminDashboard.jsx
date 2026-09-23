import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { UserPlus, UserCheck, Edit2, UserX, ShieldAlert, Check, Search, Filter } from 'lucide-react';

export default function AdminDashboard() {
  const { user } = useAuth();

  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Add Student Modal State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addRoll, setAddRoll] = useState('');
  const [addName, setAddName] = useState('');
  const [addClassId, setAddClassId] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPassword, setAddPassword] = useState('password123');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  // Edit Student Modal State
  const [editStudent, setEditStudent] = useState(null);
  const [editRoll, setEditRoll] = useState('');
  const [editName, setEditName] = useState('');
  const [editClassId, setEditClassId] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    fetchStudents();
    fetchClasses();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get('/students/all');
      setStudents(res.data.students);
    } catch (err) {
      console.error('Failed to fetch students:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const res = await api.get('/classes/all');
      setClasses(res.data.classes);
      if (res.data.classes.length > 0) {
        setAddClassId(res.data.classes[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch classes:', err);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setAddError('');
    setAddSuccess('');
    try {
      await api.post('/students/add', {
        roll_number: addRoll,
        name: addName,
        class_id: addClassId,
        parent_phone: addPhone,
        password: addPassword
      });
      setAddSuccess(`Student ${addName} (${addRoll}) added successfully!`);
      setAddRoll('');
      setAddName('');
      setAddPhone('');
      await fetchStudents();
      setTimeout(() => setIsAddOpen(false), 1200);
    } catch (err) {
      setAddError(err.response?.data?.error || 'Failed to add student');
    }
  };

  const handleEditOpen = (stu) => {
    setEditStudent(stu);
    setEditRoll(stu.roll_number);
    setEditName(stu.name);
    setEditClassId(stu.class_id);
    setEditPhone(stu.parent_phone);
    setEditError('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editStudent) return;
    setEditError('');
    try {
      await api.put(`/students/edit/${editStudent.id}`, {
        roll_number: editRoll,
        name: editName,
        class_id: editClassId,
        parent_phone: editPhone
      });
      setEditStudent(null);
      await fetchStudents();
    } catch (err) {
      setEditError(err.response?.data?.error || 'Failed to update student');
    }
  };

  const handleDeactivate = async (stuId, stuName) => {
    if (!window.confirm(`Are you sure you want to deactivate student ${stuName}?`)) return;
    try {
      await api.put(`/students/deactivate/${stuId}`);
      await fetchStudents();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to deactivate student');
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesClass = selectedClassFilter === 'all' || s.class_id === parseInt(selectedClassFilter);
    const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          s.roll_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          s.parent_phone.includes(searchQuery);
    return matchesClass && matchesSearch;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      
      {/* Header */}
      <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 flex items-center space-x-1">
              <UserCheck className="w-3.5 h-3.5" />
              <span>Incharge & Admin Portal</span>
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Student Management Roster</h1>
          <p className="text-sm text-slate-500 mt-0.5">Register new students, update class/section assignments, or deactivate student records.</p>
        </div>

        <button
          onClick={() => { setIsAddOpen(true); setAddError(''); setAddSuccess(''); }}
          className="py-2.5 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-600/30 flex items-center space-x-2 transition-all whitespace-nowrap"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Student</span>
        </button>
      </div>

      {/* Filters & Search */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs mb-6 flex flex-col sm:flex-row gap-4 justify-between items-center">
        
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, roll no, or phone..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <label className="text-xs font-bold text-slate-500 uppercase">Class Filter:</label>
          <select
            value={selectedClassFilter}
            onChange={(e) => setSelectedClassFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-800 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="all">All Classes ({students.length})</option>
            {classes.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.section_name})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Student List Table */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
        {loading ? (
          <div className="py-12 text-center text-slate-400 font-semibold">Loading student roster...</div>
        ) : filteredStudents.length > 0 ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Roll Number</th>
                  <th className="py-3 px-4">Student Name</th>
                  <th className="py-3 px-4">Assigned Class</th>
                  <th className="py-3 px-4">Parent WhatsApp</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredStudents.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/80">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900">{s.roll_number}</td>
                    <td className="py-3.5 px-4 font-bold text-slate-800">{s.name}</td>
                    <td className="py-3.5 px-4 font-semibold text-slate-700">
                      <span className="bg-slate-100 px-2.5 py-1 rounded-lg text-xs">{s.class_name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-emerald-700 font-medium font-mono text-xs">{s.parent_phone}</td>
                    <td className="py-3.5 px-4">
                      {s.status === 'active' ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Active</span>
                      ) : (
                        <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded uppercase">Inactive</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleEditOpen(s)}
                          className="p-1.5 text-slate-500 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                          title="Edit Student"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {s.status === 'active' && (
                          <button
                            onClick={() => handleDeactivate(s.id, s.name)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Deactivate Student"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400">
            No student records found.
          </div>
        )}
      </div>

      {/* --- ADD STUDENT MODAL --- */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-100 relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setIsAddOpen(false)} 
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>
            
            <h3 className="text-xl font-bold text-slate-900 mb-1">Add New Student</h3>
            <p className="text-xs text-slate-500 mb-6">Register a new student and set their login credentials.</p>

            {addError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                {addError}
              </div>
            )}
            {addSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center space-x-1.5">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{addSuccess}</span>
              </div>
            )}

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Roll Number / Portal ID</label>
                <input
                  type="text"
                  required
                  value={addRoll}
                  onChange={(e) => setAddRoll(e.target.value)}
                  placeholder="e.g. P2106"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Student's full name"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Class</label>
                <select
                  value={addClassId}
                  onChange={(e) => setAddClassId(parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.section_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Parent WhatsApp Phone</label>
                <input
                  type="text"
                  required
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="e.g. +923001234567"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Portal Password</label>
                <input
                  type="password"
                  required
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="password123"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-600/30 transition-all"
              >
                Register Student
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT STUDENT MODAL --- */}
      {editStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border border-slate-100 relative">
            <button 
              onClick={() => setEditStudent(null)} 
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 text-xl font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
            >
              ✕
            </button>
            
            <h3 className="text-xl font-bold text-slate-900 mb-1">Edit Student Record</h3>
            <p className="text-xs text-slate-500 mb-6">Update student details or class section.</p>

            {editError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium">
                {editError}
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Roll Number / Portal ID</label>
                <input
                  type="text"
                  required
                  value={editRoll}
                  onChange={(e) => setEditRoll(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Class</label>
                <select
                  value={editClassId}
                  onChange={(e) => setEditClassId(parseInt(e.target.value))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.section_name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Parent WhatsApp Phone</label>
                <input
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>

              <button
                type="submit"
                className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md shadow-emerald-600/30 transition-all"
              >
                Save Changes
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
