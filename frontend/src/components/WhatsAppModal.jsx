import React from 'react';
import { Send, Copy, Check, MessageSquare } from 'lucide-react';

export default function WhatsAppModal({ isOpen, onClose, reportData }) {
  const [copied, setCopied] = React.useState(false);

  if (!isOpen || !reportData) return null;

  const handleCopyText = () => {
    navigator.clipboard.writeText(reportData.message_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenWhatsApp = () => {
    window.open(reportData.whatsapp_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 relative animate-in fade-in zoom-in duration-200">
        <button 
          onClick={onClose} 
          className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 text-lg font-bold w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100"
        >
          ✕
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shadow-md">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900">Parent WhatsApp Report</h3>
            <p className="text-xs text-slate-500">Student: {reportData.student_name} ({reportData.parent_phone})</p>
          </div>
        </div>

        {/* Message Preview Box */}
        <div className="bg-emerald-50/50 border border-emerald-200/80 rounded-2xl p-4 mb-6">
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider mb-2 flex justify-between items-center">
            <span>Prepared WhatsApp Message</span>
            <button 
              onClick={handleCopyText}
              className="text-emerald-700 hover:text-emerald-900 flex items-center space-x-1 text-xs"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Text'}</span>
            </button>
          </div>
          <pre className="text-xs font-sans text-slate-700 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto bg-white p-3 rounded-xl border border-emerald-100 shadow-inner">
            {reportData.message_text}
          </pre>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="w-1/3 py-2.5 px-4 border border-slate-200 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleOpenWhatsApp}
            className="w-2/3 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 text-sm transition-all"
          >
            <Send className="w-4 h-4" />
            <span>Send Report on WhatsApp</span>
          </button>
        </div>

      </div>
    </div>
  );
}
