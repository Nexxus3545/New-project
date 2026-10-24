import React from 'react'
import { Text } from 'react-native'
import { SelectPicker } from './ui'
import { careOptions, genderOptions } from '../utils/patientCare'

export default function PatientCareFields({ value, onChange }) {
  return <>
    <SelectPicker label="Gender" value={value.gender || ''} options={genderOptions} onChange={(next) => onChange('gender', next)} />
    <SelectPicker label="Care type" value={value.careType || 'general'} options={careOptions} onChange={(next) => onChange('careType', next)} />
    <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18, marginBottom: 12 }}>General checkups are for all patients. Pregnancy care is a separate choice and does not create or remove a pregnancy record.</Text>
  </>
}
