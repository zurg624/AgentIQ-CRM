/**
 * Renders a single custom-field input based on the field's type definition.
 * Used in LeadDetailPanel to display admin-defined extra lead attributes.
 *
 * Props:
 *   def     — { field_key, label, field_type, options, required }
 *   value   — current value (any type)
 *   onChange(newValue) — called on edit
 *   readOnly — bool
 */

const baseStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e2e8f0',
  outline: 'none',
};

export default function CustomFieldInput({ def, value, onChange, readOnly = false }) {
  const { field_key, label, field_type, options = [], required } = def;
  const v = value ?? '';

  const inputId = `cf_${field_key}`;
  const commonProps = {
    id:        inputId,
    value:     v,
    onChange:  e => onChange(e.target.value),
    disabled:  readOnly,
    className: 'w-full rounded-lg px-3 py-2 text-sm',
    style:     baseStyle,
  };

  let control;
  switch (field_type) {
    case 'number':
      control = <input type="number" {...commonProps} />;
      break;
    case 'date':
      control = <input type="date" {...commonProps} />;
      break;
    case 'phone':
      control = <input type="tel" {...commonProps} dir="ltr" placeholder="050-1234567" />;
      break;
    case 'url':
      control = <input type="url" {...commonProps} dir="ltr" placeholder="https://..." />;
      break;
    case 'textarea':
      control = (
        <textarea
          {...commonProps}
          rows={3}
          style={{ ...baseStyle, resize: 'vertical', minHeight: 70 }}
        />
      );
      break;
    case 'select':
      control = (
        <select {...commonProps}>
          <option value="">— בחר —</option>
          {options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
      break;
    case 'text':
    default:
      control = <input type="text" {...commonProps} />;
  }

  return (
    <div>
      <label
        htmlFor={inputId}
        className="text-[10px] font-semibold uppercase tracking-wider mb-1 block text-right"
        style={{ color: '#475569' }}
      >
        {label}
        {required && <span className="text-red-400 ms-1" aria-label="חובה">*</span>}
      </label>
      {control}
    </div>
  );
}
