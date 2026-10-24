import React, { useId } from 'react'
import { careOptions, genderOptions } from '../../utils/patientCare'

export default function PatientCareFields({ value, onChange, required = false }) {
  const id = useId()
  return <>
    <div>
      <label htmlFor={`${id}-gender`} className="label">Gender{required ? ' *' : ''}</label>
      <select id={`${id}-gender`} name="gender" className="input" value={value.gender || ''} required={required} onChange={(event) => onChange('gender', event.target.value)}>
        <option value="">Select gender</option>
        {genderOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </div>
    <div>
      <label htmlFor={`${id}-care`} className="label">Care type</label>
      <select id={`${id}-care`} name="careType" className="input" value={value.careType || 'general'} onChange={(event) => onChange('careType', event.target.value)}>
        {careOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">General checkups are for all patients. Choose pregnancy care only when relevant. This does not create or remove a pregnancy record.</p>
    </div>
  </>
}
