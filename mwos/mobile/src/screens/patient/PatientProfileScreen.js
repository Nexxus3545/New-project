import React from 'react'
import * as DocumentPicker from 'expo-document-picker'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../../services/api'
import { AlertBox, Badge, Button, Card, LoadingScreen, ScreenHeader, SelectPicker } from '../../components/ui'
import { colors, spacing } from '../../components/theme'
import { useAuthStore } from '../../hooks/useAuthStore'

const documentTypeOptions = [
  { label: 'PhilHealth ID', value: 'PhilHealth ID' },
  { label: 'Birthing ID', value: 'Birthing ID' },
  { label: 'Government ID', value: 'Government ID' },
  { label: 'Lab result', value: 'Lab Result' },
  { label: 'Ultrasound report', value: 'Ultrasound Report' },
  { label: 'Other medical file', value: 'Other Medical File' },
]

function ProfileRow({ label, value, danger }) {
  return (
    <View style={styles.profileRow}>
      <Text style={styles.profileLabel}>{label}</Text>
      <Text style={[styles.profileValue, danger && { color: colors.danger }]}>{value || 'Not set'}</Text>
    </View>
  )
}

export default function PatientProfileScreen({ navigation }) {
  const queryClient = useQueryClient()
  const {
    user,
    logout,
    biometricEnabled,
    enableBiometricUnlock,
    disableBiometricUnlock,
  } = useAuthStore()
  const [securityMessage, setSecurityMessage] = React.useState('')
  const [documentMessage, setDocumentMessage] = React.useState('')
  const [documentType, setDocumentType] = React.useState('PhilHealth ID')
  const [selectedFile, setSelectedFile] = React.useState(null)
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const meQuery = useQuery({
    queryKey: ['patient-me-mobile-profile'],
    queryFn: () => api.get('/patients/me').then((response) => response.data.data),
  })
  const documentsQuery = useQuery({
    queryKey: ['patient-documents-mobile-profile'],
    queryFn: () => api.get('/documents/my').then((response) => response.data.data),
  })

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error('Please choose a document file first.')
      }

      const formData = new FormData()
      formData.append('documentType', documentType)
      formData.append('file', {
        uri: selectedFile.uri,
        name: selectedFile.name || `${documentType.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.bin`,
        type: selectedFile.mimeType || 'application/octet-stream',
      })

      setUploadProgress(0)
      setDocumentMessage('Uploading document...')

      return api.post('/documents/my', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (!event.total) return
          setUploadProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
        },
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient-documents-mobile-profile'] })
      setSelectedFile(null)
      setUploadProgress(0)
      setDocumentMessage('Document uploaded and queued for verification.')
    },
    onError: (error) => {
      setUploadProgress(0)
      setDocumentMessage(error.response?.data?.message || error.message || 'Unable to upload document.')
    },
  })

  if (meQuery.isLoading) {
    return <LoadingScreen message="Loading profile..." />
  }

  const patient = meQuery.data || {}
  const activePregnancy = (patient.pregnancies || []).find((item) => item?.status === 'active')

  const handleToggleBiometric = async () => {
    if (biometricEnabled) {
      await disableBiometricUnlock()
      setSecurityMessage('Biometric unlock disabled on this device.')
      return
    }

    const result = await enableBiometricUnlock()
    setSecurityMessage(result.success ? 'Biometric unlock enabled for this device.' : result.error)
  }

  const handlePickDocument = async () => {
    try {
      setDocumentMessage('')
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: ['application/pdf', 'image/*'],
      })

      if (result.canceled) {
        return
      }

      const asset = result.assets?.[0]
      if (!asset) {
        setDocumentMessage('No file was selected.')
        return
      }

      setSelectedFile(asset)
      setDocumentMessage(`Selected ${asset.name || 'document'}.`)
    } catch (error) {
      setDocumentMessage(error?.message || 'Unable to open the file picker.')
    }
  }

  const handleUploadDocument = async () => {
    try {
      await uploadMutation.mutateAsync()
    } catch (error) {
      // onError already updates the UI state.
    }
  }

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={`${patient.first_name || user?.firstName || ''} ${patient.last_name || user?.lastName || ''}`.trim() || 'My profile'}
        subtitle={patient.city || 'TMC Copino patient'}
        patient
      />

      <ScrollView contentContainerStyle={styles.scroll}>
        <Card patient>
          <View style={styles.heroRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {patient.first_name?.[0] || user?.firstName?.[0] || 'P'}
                {patient.last_name?.[0] || user?.lastName?.[0] || 'T'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroName}>{patient.first_name} {patient.last_name}</Text>
              <Text style={styles.heroSub}>{patient.email || user?.email}</Text>
            </View>
          </View>
          <View style={styles.badgeRow}>
            <Badge label={activePregnancy?.risk_level ? `${activePregnancy.risk_level} risk` : 'Patient'} variant={activePregnancy?.risk_level === 'high' ? 'danger' : 'patient'} />
            <Badge label={patient.blood_type || 'Blood type pending'} variant="gray" />
          </View>
        </Card>

        <Card patient>
          <ProfileRow label="Date of birth" value={patient.date_of_birth ? new Date(patient.date_of_birth).toLocaleDateString('en-PH') : null} />
          <ProfileRow label="Phone" value={patient.phone} />
          <ProfileRow label="City" value={patient.city} />
          <ProfileRow label="PhilHealth ID" value={patient.philhealth_id} />
          <ProfileRow label="Emergency contact" value={patient.emergency_contact_name} />
          <ProfileRow label="Emergency phone" value={patient.emergency_contact_phone} />
          <ProfileRow label="Allergies" value={patient.allergies || 'None known'} danger={Boolean(patient.allergies)} />
          <ProfileRow label="Conditions" value={patient.existing_conditions || 'None recorded'} />
        </Card>

        <Card patient>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }}>Device unlock</Text>
            <Badge label={biometricEnabled ? 'enabled' : 'disabled'} variant={biometricEnabled ? 'success' : 'gray'} />
          </View>
          {securityMessage ? <AlertBox type="info" message={securityMessage} /> : null}
          <Text style={{ fontSize: 13, color: colors.gray[500], lineHeight: 18, marginBottom: 12 }}>
            Enable biometric unlock to sign back into the app on this device without retyping your password.
          </Text>
          <Button
            title={biometricEnabled ? 'Disable biometric unlock' : 'Enable biometric unlock'}
            variant="secondary"
            onPress={handleToggleBiometric}
          />
        </Card>

        <Card patient>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }}>Document uploads</Text>
            <Badge label={documentsQuery.data?.length ? `${documentsQuery.data.length} saved` : 'none'} variant="patient" />
          </View>
          <Text style={{ fontSize: 13, color: colors.gray[500], lineHeight: 18, marginBottom: 12 }}>
            Upload IDs, lab results, and supporting medical files from your phone. Each file is stored and reviewed by the clinic.
          </Text>
          {documentMessage ? <AlertBox type={uploadMutation.isError ? 'critical' : 'info'} message={documentMessage} /> : null}
          <SelectPicker
            label="Document type"
            value={documentType}
            options={documentTypeOptions}
            onChange={setDocumentType}
          />
          <Button
            title="Choose file"
            variant="secondary"
            onPress={handlePickDocument}
            style={{ marginBottom: 10 }}
          />
          {selectedFile ? (
            <View style={styles.fileCard}>
              <Text style={styles.fileName}>{selectedFile.name || 'Selected file'}</Text>
              <Text style={styles.fileMeta}>
                {selectedFile.mimeType || 'Unknown type'}
                {selectedFile.size ? ` • ${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB` : ''}
              </Text>
            </View>
          ) : (
            <Text style={styles.fileHint}>No file selected yet.</Text>
          )}
          {uploadMutation.isPending || uploadProgress > 0 ? (
            <View style={styles.progressWrap}>
              <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
            </View>
          ) : null}
          <Button
            title={uploadMutation.isPending ? 'Uploading...' : 'Upload selected document'}
            variant="patient"
            loading={uploadMutation.isPending}
            disabled={!selectedFile}
            onPress={handleUploadDocument}
          />
        </Card>

        <Card patient>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: colors.gray[900] }}>Uploaded documents</Text>
            <Badge label={documentsQuery.isFetching ? 'syncing' : 'ready'} variant={documentsQuery.isFetching ? 'warning' : 'success'} />
          </View>
          {documentsQuery.isLoading ? (
            <Text style={{ fontSize: 13, color: colors.gray[500], lineHeight: 18 }}>Loading upload history...</Text>
          ) : !documentsQuery.data?.length ? (
            <Text style={{ fontSize: 13, color: colors.gray[500], lineHeight: 18 }}>No uploaded documents yet.</Text>
          ) : (
            documentsQuery.data.map((document) => (
              <View key={document.id} style={styles.documentItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.documentTitle}>{document.document_type}</Text>
                  <Text style={styles.documentMeta}>{document.original_name}</Text>
                  <Text style={styles.documentMeta}>
                    OCR: {document.ocr_status || 'pending'} • {document.verification_status || 'pending'}
                  </Text>
                </View>
                <Badge
                  label={document.verification_status || 'pending'}
                  variant={document.verification_status === 'verified' ? 'success' : document.verification_status === 'rejected' ? 'danger' : 'warning'}
                />
              </View>
            ))
          )}
        </Card>

        <View style={styles.actionStack}>
          <Button
            title="Open notifications"
            variant="secondary"
            onPress={() => navigation.navigate('PatientNotifications')}
          />
          <Button
            title="Emergency support"
            variant="secondary"
            onPress={() => navigation.navigate('PatientEmergency')}
          />
          <TouchableOpacity onPress={logout} activeOpacity={0.84} style={styles.signOut}>
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.brand.pearl,
  },
  scroll: {
    padding: spacing.lg,
    paddingBottom: 40,
    gap: spacing.sm,
  },
  heroRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.blush,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.brand.copper,
  },
  heroName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.gray[900],
  },
  heroSub: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  profileRow: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  profileLabel: {
    width: 122,
    fontSize: 12,
    color: colors.gray[400],
  },
  profileValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.gray[800],
  },
  actionStack: {
    gap: spacing.sm,
  },
  signOut: {
    paddingVertical: 14,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  fileCard: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray[100],
  },
  fileName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[900],
  },
  fileMeta: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
  },
  fileHint: {
    marginBottom: 10,
    fontSize: 12,
    color: colors.gray[500],
  },
  progressWrap: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.gray[100],
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.brand.rose,
    borderRadius: 999,
  },
  documentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.gray[100],
  },
  documentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.gray[900],
  },
  documentMeta: {
    marginTop: 2,
    fontSize: 12,
    color: colors.gray[500],
  },
})
