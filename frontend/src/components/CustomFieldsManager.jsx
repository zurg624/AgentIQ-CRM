import { useState, useEffect } from 'react';
import api from '../api';

const FIELD_TYPES = [
  { value: 'text',     label: 'טקסט קצר' },
  { value: 'textarea', label: 'טקסט ארוך' },
  { value: 'number',   label: 'מספר' },
  { value: 'date',     label: 'תאריך' },
  { value: 'phone',    label: 'טלפון' },
  { value: 'url',      label: 'קישור' },
  { value: 'select',   label: 'בחירה מרשימה' },
];

const EMPTY_FORM = {
  field_key:  '',
  label:      '',
  field_type: 'text',
  options:    [],
  required:   false,
};

const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0',
  outline: 'none',
};

export default function CustomFieldsManager() {
  const [fields,    setFields]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');
  const [optionInput, setOptionInput] = useState('');

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getCustomFields();
      setFields(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (f) => {
    setEditingId(f.id);
    setForm({
      field_key:  f.field_key,
      label:      f.label,
      field_type: f.field_type,
      options:    f.options || [],
      required:   !!f.required,
    });
    setError('');
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setOptionInput('');
    setError('');
  };

  const addOption = () => {
    const v = optionInput.trim();
    if (!v) return;
    if (form.options.includes(v)) { setOptionInput(''); return; }
    set('options', [...form.options, v]);
    setOptionInput('');
  };

  const removeOption = (opt) => {
    set('options', form.options.filter(o => o !== opt));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        label:      form.label.trim(),
        field_type: form.field_type,
        options:    form.field_type === 'select' ? form.options : [],
        required:   form.required,
      };
      if (!editingId) {
        // create requires field_key
        if (!form.field_key.trim()) {
          throw new Error('field_key חובה');
        }
        payload.field_key = form.field_key.trim();
      }
      if (!payload.label) throw new Error('label חובה');
      if (form.field_type === 'select' && payload.options.length === 0) {
        throw new Error('שדה מסוג "בחירה מרשימה" חייב לפחות אופציה אחת');
      }

      if (editingId) {
        await api.updateCustomField(editingId, payload);
      } else {
        await api.createCustomField(payload);
      }
      await load();
      resetForm();
    } catch (err) {
      setError(err.message || 'שגיאה');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('למחוק את השדה? הערכים שכבר נשמרו ב-לידים יישארו במסד אבל לא יוצגו.')) return;
    try {
      await api.deleteCustomField(id);
      await load();
    } catch (err) {
      alert('שגיאה במחיקה: ' + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Existing fields list */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider mb-2 text-right" style={{ color: '#94a3b8' }}>
          שדות מוגדרים ({fields.length})
        </h3>

        {loading ? (
          <div className="text-xs text-center py-4" style={{ color: '#475569' }}>טוען...</div>
        ) : fields.length === 0 ? (
          <div className="text-xs text-center py-6 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.03)', color: '#475569', border: '1px dashed rgba(255,255,255,0.07)' }}>
            עדיין לא הוגדרו שדות מותאמים אישית
          </div>
        ) : (
          <div className="space-y-2">
            {fields.map(f => (
              <div key={f.id} className="rounded-xl px-3 py-2.5 flex items-center justify-between gap-3"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex items-center gap-2">
                  <button onClick={() => startEdit(f)} title="עריכה"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                    style={{ background: 'rgba(234,179,8,0.15)', color: '#fbbf24' }}>✏️</button>
                  <button onClick={() => handleDelete(f.id)} title="מחיקה"
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>🗑️</button>
                </div>
                <div className="flex-1 text-right min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{f.label}
                    {f.required && <span className="text-red-400 ms-1">*</span>}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>
                    <span className="font-mono">{f.field_key}</span>
                    <span className="mx-1.5">·</span>
                    <span>{FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type}</span>
                    {f.field_type === 'select' && f.options?.length > 0 && (
                      <span className="mx-1.5">· {f.options.length} אופציות</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit form */}
      <div className="rounded-2xl p-4 space-y-3"
        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)' }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: '#a5b4fc' }}>
            {editingId ? '✏️ עריכת שדה קיים' : '➕ הוסף שדה חדש'}
          </span>
          {editingId && (
            <button onClick={resetForm}
              className="text-[11px] font-semibold px-2 py-1 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
              ביטול
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {!editingId && (
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right"
                style={{ color: '#64748b' }}>
                מפתח (אנגלית, lowercase)
              </label>
              <input type="text" value={form.field_key}
                onChange={e => set('field_key', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                placeholder="school_grade"
                dir="ltr"
                className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                style={inputStyle} />
            </div>
          )}

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right"
              style={{ color: '#64748b' }}>
              תווית בעברית
            </label>
            <input type="text" value={form.label}
              onChange={e => set('label', e.target.value)}
              placeholder="כיתת ילד"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle} />
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right"
              style={{ color: '#64748b' }}>
              סוג שדה
            </label>
            <select value={form.field_type}
              onChange={e => set('field_type', e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}>
              {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        {/* Options editor — only for 'select' */}
        {form.field_type === 'select' && (
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider block mb-1 text-right"
              style={{ color: '#64748b' }}>
              אופציות לבחירה
            </label>
            <div className="flex gap-2">
              <input type="text" value={optionInput}
                onChange={e => setOptionInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
                placeholder="הוסף אופציה ולחץ Enter"
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={inputStyle} />
              <button onClick={addOption}
                className="text-xs font-semibold px-3 py-2 rounded-lg"
                style={{ background: 'rgba(34,197,94,0.18)', color: '#4ade80' }}>+ הוסף</button>
            </div>
            {form.options.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2 justify-end">
                {form.options.map(opt => (
                  <span key={opt}
                    className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1.5"
                    style={{ background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}>
                    {opt}
                    <button onClick={() => removeOption(opt)} className="opacity-60 hover:opacity-100">✕</button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 justify-end cursor-pointer">
          <span className="text-xs" style={{ color: '#cbd5e1' }}>שדה חובה</span>
          <input type="checkbox" checked={form.required}
            onChange={e => set('required', e.target.checked)} />
        </label>

        {error && (
          <div className="text-xs px-3 py-2 rounded-lg text-right"
            style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.25)' }}>
            ⚠️ {error}
          </div>
        )}

        <button onClick={handleSave} disabled={saving}
          className="w-full text-sm font-bold py-2.5 rounded-xl disabled:opacity-50"
          style={{
            background: saving ? 'rgba(255,255,255,0.08)' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
            color: 'white',
          }}>
          {saving ? 'שומר...' : (editingId ? '💾 עדכן שדה' : '➕ הוסף שדה')}
        </button>
      </div>
    </div>
  );
}
